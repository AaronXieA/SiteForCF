package uk.xrst.market;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import net.fabricmc.api.DedicatedServerModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.ItemLore;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

/**
 * 仅服务端：游戏内访问网站二手交易。
 * /buy            — 开箱子 GUI + 聊天区列表，看在架物品
 * /buy take <id>  — 拍下指定帖子（聊天区点列表项自动拼这个指令）
 * /buybind <码>   — 绑定网站账号（码在网页 /market/ 点「绑定 MC」生成）
 * /buytell <消息> [序号] — 给交易临时聊天发消息；多个对话时用序号指定
 */
public class XrstMarketMod implements DedicatedServerModInitializer {

    private static final String DEFAULT_API = "";
    private static final int COLOR_TITLE  = 0x55AAFF;
    private static final int COLOR_SELL   = 0x55FF55;
    private static final int COLOR_BUY    = 0xFFAA55;
    private static final int COLOR_BARTER = 0xFF55FF;
    private static final int COLOR_WARN   = 0xFF5555;
    private static final int COLOR_INFO   = 0xAAAAAA;
    private static final int COLOR_GOLD   = 0xFFAA00;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private String apiUrl = DEFAULT_API;
    private String secret = "";
    private boolean enabled = true;
    private MinecraftServer server;

    @Override
    public void onInitializeServer() {
        loadConfig();
        if (!enabled) {
            System.out.println("[XRST-Market] 已在 config/xrst-market.properties 中禁用。");
            return;
        }
        if (secret.isBlank() || "CHANGE_ME".equals(secret)) {
            System.out.println("[XRST-Market] 未配置 secret：请编辑 config/xrst-market.properties 后重启。");
            return;
        }
        if (apiUrl.isBlank()) {
            System.out.println("[XRST-Market] 未配置 api-url：请编辑 config/xrst-market.properties 后重启。");
            return;
        }

        ServerLifecycleEvents.SERVER_STARTED.register(s -> this.server = s);
        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> registerCommands(dispatcher));
        System.out.println("[XRST-Market] 已启动，API: " + apiUrl);
    }

    /* ================= 指令注册 ================= */

    private void registerCommands(CommandDispatcher<CommandSourceStack> d) {
        // /buy — 列表 + GUI
        d.register(Commands.literal("buy")
            .executes(this::cmdBuy)
            .then(Commands.literal("take")
                .then(Commands.argument("id", StringArgumentType.word())
                    .executes(ctx -> cmdBuyTake(ctx, StringArgumentType.getString(ctx, "id")))))
        );

        // /buybind <码>
        d.register(Commands.literal("buybind")
            .then(Commands.argument("code", StringArgumentType.word())
                .executes(ctx -> cmdBind(ctx, StringArgumentType.getString(ctx, "code"))))
        );

        // /buytell <消息> [序号]
        d.register(Commands.literal("buytell")
            .then(Commands.argument("message", StringArgumentType.greedyString())
                .executes(ctx -> cmdTell(ctx, StringArgumentType.getString(ctx, "message"), -1))
                .then(Commands.argument("index", IntegerArgumentType.integer(1))
                    .executes(ctx -> cmdTell(ctx,
                        StringArgumentType.getString(ctx, "message"),
                        IntegerArgumentType.getInteger(ctx, "index")))))
        );

        // /buyhelp — 帮助
        d.register(Commands.literal("buyhelp")
            .executes(this::cmdHelp)
        );
    }

    /* ================= /buyhelp ================= */

    private int cmdHelp(CommandContext<CommandSourceStack> ctx) {
        ServerPlayer player = ctx.getSource().getPlayer();
        if (player == null) return 0;
        MutableComponent msg = Component.empty()
            .append(Component.literal("====== 🛍️ 二手交易帮助 ======\n").setStyle(Style.EMPTY.withColor(COLOR_TITLE).withBold(true)))
            .append(Component.literal("/buy\n").setStyle(Style.EMPTY.withColor(COLOR_GOLD)))
            .append(Component.literal("  看在架物品，聊天区点行即可拍下\n").setStyle(Style.EMPTY.withColor(COLOR_INFO)))
            .append(Component.literal("/buy take <id>\n").setStyle(Style.EMPTY.withColor(COLOR_GOLD)))
            .append(Component.literal("  手动拍下指定帖子\n").setStyle(Style.EMPTY.withColor(COLOR_INFO)))
            .append(Component.literal("/buybind <6位码>\n").setStyle(Style.EMPTY.withColor(COLOR_GOLD)))
            .append(Component.literal("  绑定网站账号（码在网页 /market/ 点「绑定 MC」生成）\n").setStyle(Style.EMPTY.withColor(COLOR_INFO)))
            .append(Component.literal("/buytell <消息> [序号]\n").setStyle(Style.EMPTY.withColor(COLOR_GOLD)))
            .append(Component.literal("  给交易对方发消息；多个交易时用序号指定\n").setStyle(Style.EMPTY.withColor(COLOR_INFO)))
            .append(Component.literal("/buyhelp\n").setStyle(Style.EMPTY.withColor(COLOR_GOLD)))
            .append(Component.literal("  显示这个帮助\n").setStyle(Style.EMPTY.withColor(COLOR_INFO)))
            .append(Component.literal("=============================").setStyle(Style.EMPTY.withColor(COLOR_TITLE).withBold(true)));
        tell(player, msg);
        return 1;
    }

    /* ================= /buy ================= */

    private int cmdBuy(CommandContext<CommandSourceStack> ctx) {
        ServerPlayer player = ctx.getSource().getPlayer();
        if (player == null) return 0;

        asyncGet("/api/mc/market", resp -> {
            if (resp == null) { tell(player, "❌ 连接网站失败，等会再试", COLOR_WARN); return; }
            JsonObject root = parseJson(resp);
            if (root == null || !root.get("ok").getAsBoolean()) {
                tell(player, "❌ " + errOf(root, "获取列表失败"), COLOR_WARN);
                return;
            }
            JsonArray arr = root.getAsJsonArray("open");
            if (arr == null || arr.size() == 0) {
                tell(player, "📭 集市空空如也，去网页 /market/ 发布一个吧～", COLOR_INFO);
                return;
            }
            List<JsonObject> list = new ArrayList<>();
            for (JsonElement e : arr) list.add(e.getAsJsonObject());

            // 聊天区可点列表
            MutableComponent msg = Component.empty()
                .append(Component.literal("====== 🛍️ 二手交易 ======\n").setStyle(Style.EMPTY.withColor(COLOR_TITLE).withBold(true)));
            for (int i = 0; i < list.size(); i++) {
                JsonObject l = list.get(i);
                String type = l.get("type").getAsString();
                String item = l.get("item").getAsString();
                String id = l.get("id").getAsString();
                int price = l.has("price") ? l.get("price").getAsInt() : 0;
                String owner = l.get("owner").getAsString();
                String desc = l.has("desc") ? l.get("desc").getAsString() : "";
                String want = l.has("want") && !l.get("want").isJsonNull() ? l.get("want").getAsString() : "";

                int color = type.equals("sell") ? COLOR_SELL : (type.equals("buy") ? COLOR_BUY : COLOR_BARTER);
                String tag = type.equals("sell") ? "出售" : (type.equals("buy") ? "收购" : "交换");
                String priceStr = type.equals("barter") ? (" ⇄ " + want) : (" · " + price + "🪙");
                String line = "[" + (i + 1) + "] " + tag + " · " + item + priceStr + " · @" + owner;

                Style st = Style.EMPTY.withColor(color)
                    .withClickEvent(new ClickEvent.RunCommand("/buy take " + id));
                String hoverText = (desc.isEmpty() ? "" : desc + "\n") + "点击拍下";
                st = st.withHoverEvent(new HoverEvent.ShowText(Component.literal(hoverText)));
                msg.append(Component.literal(line).setStyle(st)).append(Component.literal("\n"));
            }
            msg.append(Component.literal("========================\n").setStyle(Style.EMPTY.withColor(COLOR_TITLE).withBold(true)));
            msg.append(Component.literal("💡 点上面任意一行拍下").setStyle(Style.EMPTY.withColor(COLOR_INFO)));
            tell(player, msg);

            // 同时开箱子 GUI（纯展示，拿不走）
            openMarketGui(player, list);
        });
        return 1;
    }

    private void openMarketGui(ServerPlayer player, List<JsonObject> list) {
        int rows = Math.min(6, Math.max(1, (list.size() + 8) / 9));
        int slots = rows * 9;
        SimpleContainer container = new SimpleContainer(slots);
        for (int i = 0; i < list.size() && i < slots; i++) {
            JsonObject l = list.get(i);
            String type = l.get("type").getAsString();
            String item = l.get("item").getAsString();
            int price = l.has("price") ? l.get("price").getAsInt() : 0;
            String owner = l.get("owner").getAsString();
            String desc = l.has("desc") ? l.get("desc").getAsString() : "";
            String want = l.has("want") && !l.get("want").isJsonNull() ? l.get("want").getAsString() : "";

            // 帖子物品名是自由文本，映射不到真实物品，用固定图标区分类型
            ItemStack stack = new ItemStack(switch (type) {
                case "buy" -> Items.GOLD_INGOT;
                case "barter" -> Items.COMPARATOR;
                default -> Items.EMERALD;
            });
            String tag = type.equals("sell") ? "§a出售" : (type.equals("buy") ? "§6收购" : "§d交换");
            String priceStr = type.equals("barter") ? (" §7⇄ §f" + want) : (" §e" + price + "🪙");
            stack.set(DataComponents.CUSTOM_NAME, Component.literal(tag + " §f" + item + priceStr));

            List<Component> lore = new ArrayList<>();
            lore.add(Component.literal("§7楼主: §f@" + owner));
            if (!desc.isEmpty()) lore.add(Component.literal("§7备注: §f" + desc));
            lore.add(Component.literal("§8点聊天区对应行拍下"));
            stack.set(DataComponents.LORE, new ItemLore(lore));
            container.setItem(i, stack);
        }
        // 空白格填玻璃板
        for (int i = Math.min(list.size(), slots); i < slots; i++) {
            ItemStack glass = new ItemStack(Items.STAINED_GLASS_PANE.gray());
            glass.set(DataComponents.CUSTOM_NAME, Component.literal(" "));
            container.setItem(i, glass);
        }

        MenuType<?> menuType = switch (rows) {
            case 1 -> MenuType.GENERIC_9x1;
            case 2 -> MenuType.GENERIC_9x2;
            case 3 -> MenuType.GENERIC_9x3;
            case 4 -> MenuType.GENERIC_9x4;
            case 5 -> MenuType.GENERIC_9x5;
            default -> MenuType.GENERIC_9x6;
        };
        player.openMenu(new SimpleMenuProvider(
            (syncId, inv, p) -> new ViewOnlyChestMenu(menuType, syncId, inv, container, rows),
            Component.literal("🛍️ 二手交易（聊天区点行拍下）")));
    }

    /* 纯展示箱子：覆盖点击与快速移动，物品拿不走 */
    private static class ViewOnlyChestMenu extends ChestMenu {
        ViewOnlyChestMenu(MenuType<?> type, int syncId, Inventory inv, Container container, int rows) {
            super(type, syncId, inv, container, rows);
        }
        @Override
        public void clicked(int slotId, int button, ContainerInput containerInput, Player player) {
            // 不移动任何物品，服务端状态不变，客户端会被同步回去
        }
        @Override
        public ItemStack quickMoveStack(Player player, int index) {
            return ItemStack.EMPTY;
        }
    }

    /* ================= /buy take ================= */

    private int cmdBuyTake(CommandContext<CommandSourceStack> ctx, String id) {
        ServerPlayer player = ctx.getSource().getPlayer();
        if (player == null) return 0;
        String mcname = player.getName().getString();
        asyncPost("/api/mc/market/take", makeJson("id", id, "mcname", mcname), resp -> {
            if (resp == null) { tell(player, "❌ 连接失败", COLOR_WARN); return; }
            JsonObject root = parseJson(resp);
            if (root == null || !root.get("ok").getAsBoolean()) {
                tell(player, "❌ " + errOf(root, "拍下失败"), COLOR_WARN);
                return;
            }
            JsonObject listing = root.getAsJsonObject("listing");
            String item = listing.get("item").getAsString();
            String type = listing.get("type").getAsString();
            int price = listing.has("price") ? listing.get("price").getAsInt() : 0;
            String t = type.equals("sell") ? "买下" : (type.equals("buy") ? "供货" : "交换");
            tell(player, "✅ " + t + "成功：" + item + (price > 0 ? " · " + price + "🪙 已进担保" : "")
                + "\n💬 可用 /buytell <消息> 与对方聊天", COLOR_SELL);
        });
        return 1;
    }

    /* ================= /buybind ================= */

    private int cmdBind(CommandContext<CommandSourceStack> ctx, String code) {
        ServerPlayer player = ctx.getSource().getPlayer();
        if (player == null) return 0;
        String mcname = player.getName().getString();
        asyncPost("/api/mc/market/bind", makeJson("mcname", mcname, "code", code), resp -> {
            if (resp == null) { tell(player, "❌ 连接失败", COLOR_WARN); return; }
            JsonObject root = parseJson(resp);
            if (root == null || !root.get("ok").getAsBoolean()) {
                tell(player, "❌ " + errOf(root, "绑定失败"), COLOR_WARN);
                return;
            }
            String user = root.get("user").getAsString();
            tell(player, "✅ 绑定成功！MC 账号 " + mcname + " 已绑定网站用户 @" + user + "\n现在可以用 /buy 和 /buytell 了～", COLOR_SELL);
        });
        return 1;
    }

    /* ================= /buytell ================= */

    private int cmdTell(CommandContext<CommandSourceStack> ctx, String message, int index) {
        ServerPlayer player = ctx.getSource().getPlayer();
        if (player == null) return 0;
        String mcname = player.getName().getString();

        asyncGet("/api/mc/market/chats?mcname=" + mcname, resp -> {
            if (resp == null) { tell(player, "❌ 连接失败", COLOR_WARN); return; }
            JsonObject root = parseJson(resp);
            if (root == null || !root.get("ok").getAsBoolean()) {
                tell(player, "❌ " + errOf(root, "获取交易列表失败"), COLOR_WARN);
                return;
            }
            JsonArray chats = root.getAsJsonArray("chats");
            if (chats == null || chats.size() == 0) {
                tell(player, "📭 你没有进行中的交易。先用 /buy 拍下一个吧～", COLOR_INFO);
                return;
            }
            if (chats.size() == 1) {
                sendChatMessage(player, mcname, chats.get(0).getAsJsonObject(), message);
                return;
            }
            // 多个交易：没给序号就列出来
            if (index < 1) {
                MutableComponent msg = Component.empty()
                    .append(Component.literal("💬 你有多个进行中的交易，用 /buytell <消息> <序号> 指定：\n")
                        .setStyle(Style.EMPTY.withColor(COLOR_TITLE).withBold(true)));
                for (int i = 0; i < chats.size(); i++) {
                    JsonObject c = chats.get(i).getAsJsonObject();
                    String item = c.get("item").getAsString();
                    String type = c.get("type").getAsString();
                    // 对方 = 楼主和拍家中不是我那个
                    String owner = c.get("owner").getAsString();
                    String taker = c.has("taker") && !c.get("taker").isJsonNull() ? c.get("taker").getAsString() : "";
                    String meBound = root.has("me") ? root.get("me").getAsString() : "";
                    String other = meBound.equals(owner) ? taker : owner;
                    String tag = type.equals("sell") ? "出售" : (type.equals("buy") ? "收购" : "交换");
                    int color = type.equals("sell") ? COLOR_SELL : (type.equals("buy") ? COLOR_BUY : COLOR_BARTER);
                    msg.append(Component.literal("[" + (i + 1) + "] " + tag + " · " + item + " · 对方 @" + other + "\n")
                        .setStyle(Style.EMPTY.withColor(color)));
                }
                tell(player, msg);
                return;
            }
            if (index > chats.size()) {
                tell(player, "❌ 序号超出范围，目前只有 " + chats.size() + " 个交易", COLOR_WARN);
                return;
            }
            sendChatMessage(player, mcname, chats.get(index - 1).getAsJsonObject(), message);
        });
        return 1;
    }

    private void sendChatMessage(ServerPlayer player, String mcname, JsonObject chat, String text) {
        String lid = chat.get("id").getAsString();
        asyncPost("/api/mc/market/chat", makeJson("lid", lid, "mcname", mcname, "text", text), resp -> {
            if (resp == null) { tell(player, "❌ 连接失败", COLOR_WARN); return; }
            JsonObject root = parseJson(resp);
            if (root == null || !root.get("ok").getAsBoolean()) {
                tell(player, "❌ " + errOf(root, "发送失败"), COLOR_WARN);
                return;
            }
            tell(player, "📤 已发送", COLOR_INFO);
        });
    }

    /* ================= HTTP 工具 ================= */

    private void asyncGet(String path, java.util.function.Consumer<String> cb) {
        String url = apiUrl + path;
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .GET();
        if (!secret.isBlank()) b.header("X-MC-Secret", secret);
        http.sendAsync(b.build(), HttpResponse.BodyHandlers.ofString())
                .thenAccept(r -> {
                    if (r.statusCode() == 401 || r.statusCode() == 403) {
                        System.out.println("[XRST-Market] 密钥被拒绝（" + r.statusCode() + "），请检查 config/xrst-market.properties");
                    }
                    cb.accept(r.statusCode() / 100 == 2 ? r.body() : null);
                })
                .exceptionally(t -> { cb.accept(null); return null; });
    }

    private void asyncPost(String path, JsonObject body, java.util.function.Consumer<String> cb) {
        String url = apiUrl + path;
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("Content-Type", "application/json; charset=utf-8")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8));
        if (!secret.isBlank()) b.header("X-MC-Secret", secret);
        http.sendAsync(b.build(), HttpResponse.BodyHandlers.ofString())
                .thenAccept(r -> {
                    if (r.statusCode() == 401 || r.statusCode() == 403) {
                        System.out.println("[XRST-Market] 密钥被拒绝（" + r.statusCode() + "），请检查 config/xrst-market.properties");
                    }
                    cb.accept(r.statusCode() / 100 == 2 ? r.body() : null);
                })
                .exceptionally(t -> { cb.accept(null); return null; });
    }

    private JsonObject makeJson(String... kvs) {
        JsonObject o = new JsonObject();
        for (int i = 0; i + 1 < kvs.length; i += 2) o.addProperty(kvs[i], kvs[i + 1]);
        return o;
    }

    private JsonObject parseJson(String s) {
        try { return JsonParser.parseString(s).getAsJsonObject(); }
        catch (Exception e) { return null; }
    }

    private String errOf(JsonObject root, String fallback) {
        return root != null && root.has("error") ? root.get("error").getAsString() : fallback;
    }

    /* ================= 发消息（回主线程发包）================= */

    private void tell(ServerPlayer p, String text, int color) {
        tell(p, Component.literal(text).setStyle(Style.EMPTY.withColor(color)));
    }

    private void tell(ServerPlayer p, MutableComponent msg) {
        if (server == null) return;
        server.execute(() -> p.sendSystemMessage(msg));
    }

    /* ================= 配置 ================= */

    private void loadConfig() {
        Path configDir = FabricLoader.getInstance().getConfigDir();
        Path file = configDir.resolve("xrst-market.properties");
        Properties p = new Properties();
        if (Files.exists(file)) {
            try (InputStream in = Files.newInputStream(file)) { p.load(in); }
            catch (IOException e) { System.out.println("[XRST-Market] 读取配置失败: " + e); }
        }
        enabled = Boolean.parseBoolean(p.getProperty("enabled", "true"));
        apiUrl = p.getProperty("api-url", DEFAULT_API);
        secret = p.getProperty("secret", "");

        if (!Files.exists(file)) {
            p.setProperty("enabled", "true");
            p.setProperty("api-url", "");
            p.setProperty("secret", "CHANGE_ME");
            try {
                Files.createDirectories(configDir);
                try (OutputStream out = Files.newOutputStream(file)) {
                    p.store(out, "XRST Market configuration.\nSet api-url to your website (e.g. https://xrst.uk) and secret to match the backend.");
                }
                System.out.println("[XRST-Market] 已生成配置文件 config/xrst-market.properties，请填写 api-url 和 secret 后重启。");
            } catch (IOException e) {
                System.out.println("[XRST-Market] 生成配置文件失败: " + e);
            }
        }
    }
}
