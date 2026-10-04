package uk.xrst.market;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
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
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * 仅服务端：游戏内访问网站二手交易。
 *  /buy            — 开 6 行大箱子浏览在架物品，点物品直接拍下，可翻页
 *  /buy take <id>  — 聊天指令拍下（聊天区列表点击自动拼）
 *  /buysell        — 挂商品向导：箱子选类型（卖 / 收 / 以物易物），聊天分步填信息
 *  /buybind <码>   — 绑定网站账号
 *  /buytell <消息> [序号] — 交易临时聊天
 *  /buyhelp        — 帮助
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
    private static final int COLOR_MY     = 0xFF7777;

    // 箱子布局：6 行，前 5 行放商品，最后一行是功能栏
    private static final int MENU_ROWS = 6;
    private static final int MENU_SIZE = 54;
    private static final int PER_PAGE = 45;
    private static final int SLOT_PREV = 45;
    private static final int SLOT_POST = 47;
    private static final int SLOT_INFO = 49;
    private static final int SLOT_NEXT = 53;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    private String apiUrl = DEFAULT_API;
    private String secret = "";
    private boolean enabled = true;
    private MinecraftServer server;

    // 挂单向导的临时草稿（UUID -> 草稿）
    private final Map<UUID, Draft> drafts = new ConcurrentHashMap<>();

    private static final class Draft {
        String type;
        String item;
        int price = -1;
        String desc = "";
    }

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

    private void registerCommands(com.mojang.brigadier.CommandDispatcher<CommandSourceStack> d) {
        d.register(Commands.literal("buy")
            .executes(this::cmdBuy)
            .then(Commands.literal("take")
                .then(Commands.argument("id", StringArgumentType.word())
                    .executes(ctx -> cmdBuyTake(ctx, StringArgumentType.getString(ctx, "id")))))
        );

        // /buysell [sell|buy|barter] — 挂商品
        var buysell = Commands.literal("buysell").executes(ctx -> { openTypeMenu(requirePlayer(ctx)); return 1; });
        for (String t : new String[]{"sell", "buy", "barter"}) {
            buysell.then(Commands.literal(t).executes(ctx -> {
                startDraft(requirePlayer(ctx), t);
                return 1;
            }));
        }
        buysell.then(Commands.literal("name")
            .then(Commands.argument("item", StringArgumentType.greedyString())
                .executes(ctx -> cmdDraftName(ctx, StringArgumentType.getString(ctx, "item")))));
        buysell.then(Commands.literal("price")
            .then(Commands.argument("price", IntegerArgumentType.integer(0, 999999))
                .executes(ctx -> cmdDraftPrice(ctx, IntegerArgumentType.getInteger(ctx, "price")))));
        buysell.then(Commands.literal("desc")
            .then(Commands.argument("desc", StringArgumentType.greedyString())
                .executes(ctx -> cmdDraftDesc(ctx, StringArgumentType.getString(ctx, "desc")))));
        buysell.then(Commands.literal("ok").executes(ctx -> { submitDraft(requirePlayer(ctx)); return 1; }));
        buysell.then(Commands.literal("cancel").executes(ctx -> { cancelDraft(requirePlayer(ctx)); return 1; }));
        d.register(buysell);

        d.register(Commands.literal("buybind")
            .then(Commands.argument("code", StringArgumentType.word())
                .executes(ctx -> cmdBind(ctx, StringArgumentType.getString(ctx, "code"))))
        );

        d.register(Commands.literal("buytell")
            .then(Commands.argument("message", StringArgumentType.greedyString())
                .executes(ctx -> cmdTell(ctx, StringArgumentType.getString(ctx, "message"), -1))
                .then(Commands.argument("index", IntegerArgumentType.integer(1))
                    .executes(ctx -> cmdTell(ctx,
                        StringArgumentType.getString(ctx, "message"),
                        IntegerArgumentType.getInteger(ctx, "index")))))
        );

        d.register(Commands.literal("buyhelp").executes(this::cmdHelp));
    }

    private ServerPlayer requirePlayer(CommandContext<CommandSourceStack> ctx) {
        return ctx.getSource().getPlayer();
    }

    /* ================= /buyhelp ================= */

    private int cmdHelp(CommandContext<CommandSourceStack> ctx) {
        ServerPlayer player = requirePlayer(ctx);
        if (player == null) return 0;
        MutableComponent msg = Component.empty()
            .append(Component.literal("====== 🛍️ 二手交易帮助 ======\n").setStyle(Style.EMPTY.withColor(COLOR_TITLE).withBold(true)))
            .append(Component.literal("/buy\n").setStyle(Style.EMPTY.withColor(COLOR_GOLD)))
            .append(Component.literal("  打开集市大箱子：点物品直接拍下，可翻页\n").setStyle(Style.EMPTY.withColor(COLOR_INFO)))
            .append(Component.literal("/buysell\n").setStyle(Style.EMPTY.withColor(COLOR_GOLD)))
            .append(Component.literal("  挂商品：箱子里选 卖/收/交换，按提示分步填\n").setStyle(Style.EMPTY.withColor(COLOR_INFO)))
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

    /* ================= /buy：拉列表 + 开箱子 ================= */

    private int cmdBuy(CommandContext<CommandSourceStack> ctx) {
        ServerPlayer player = requirePlayer(ctx);
        if (player == null) return 0;
        loadAndOpen(player, 0);
        return 1;
    }

    private void loadAndOpen(ServerPlayer player, int page) {
        String mcname = player.getName().getString();
        asyncGet("/api/mc/market?mcname=" + enc(mcname), resp -> onMain(player, () -> {
            if (resp.code() == 0 || resp.body() == null) {
                tell(player, "❌ " + niceError(resp, "拉取集市失败"), COLOR_WARN);
                return;
            }
            JsonObject root = parseJson(resp.body());
            if (root == null || !root.getAsJsonPrimitive("ok").getAsBoolean()) {
                tell(player, "❌ " + errOf(root, "拉取集市失败"), COLOR_WARN);
                return;
            }
            JsonArray arr = root.getAsJsonArray("open");
            String me = root.has("me") && !root.get("me").isJsonNull() ? root.get("me").getAsString() : null;
            List<JsonObject> list = new ArrayList<>();
            if (arr != null) for (JsonElement e : arr) list.add(e.getAsJsonObject());

            if (list.isEmpty()) {
                tell(player, "📭 集市空空如也，用 /buysell 挂第一件商品吧～", COLOR_INFO);
                return;
            }
            printChatList(player, list, me);
            int totalPages = (list.size() + PER_PAGE - 1) / PER_PAGE;
            int safePage = Math.max(0, Math.min(page, totalPages - 1));
            openMarketGui(player, list, me, safePage, totalPages);
        }));
    }

    private void printChatList(ServerPlayer player, List<JsonObject> list, String me) {
        MutableComponent msg = Component.empty()
            .append(Component.literal("====== 🛍️ 二手交易 ======\n").setStyle(Style.EMPTY.withColor(COLOR_TITLE).withBold(true)));
        for (int i = 0; i < list.size(); i++) {
            JsonObject l = list.get(i);
            String type = l.get("type").getAsString();
            String item = l.get("item").getAsString();
            String id = l.get("id").getAsString();
            int price = l.has("price") ? l.get("price").getAsInt() : 0;
            String owner = l.get("owner").getAsString();
            boolean mine = me != null && me.equals(owner);

            int color = type.equals("sell") ? COLOR_SELL : (type.equals("buy") ? COLOR_BUY : COLOR_BARTER);
            String tag = type.equals("sell") ? "出售" : (type.equals("buy") ? "收购" : "交换");
            String priceStr = type.equals("barter") ? "" : (" · " + price + "🪙");
            String line = "[" + (i + 1) + "] " + tag + " · " + item + priceStr + " · @" + owner
                + (mine ? " （你的帖子）" : "");
            Style st = Style.EMPTY.withColor(mine ? COLOR_MY : color);
            if (!mine) {
                st = st.withClickEvent(new ClickEvent.RunCommand("/buy take " + id))
                       .withHoverEvent(new HoverEvent.ShowText(Component.literal("点击拍下")));
            }
            msg.append(Component.literal(line).setStyle(st)).append(Component.literal("\n"));
        }
        msg.append(Component.literal("========================\n").setStyle(Style.EMPTY.withColor(COLOR_TITLE).withBold(true)));
        msg.append(Component.literal("💡 箱子里直接点物品就能拍下，点 ✨ 挂商品").setStyle(Style.EMPTY.withColor(COLOR_INFO)));
        tell(player, msg);
    }

    /* ================= 集市大箱子 ================= */

    private void openMarketGui(ServerPlayer player, List<JsonObject> list, String me, int page, int totalPages) {
        SimpleContainer container = new SimpleContainer(MENU_SIZE);
        Map<Integer, Runnable> actions = new ConcurrentHashMap<>();

        // 功能栏：先全部铺灰玻璃板
        for (int s = PER_PAGE; s < MENU_SIZE; s++) {
            container.setItem(s, pane(" "));
        }

        int start = page * PER_PAGE;
        int end = Math.min(list.size(), start + PER_PAGE);
        for (int i = start; i < end; i++) {
            int slot = i - start;
            JsonObject l = list.get(i);
            String id = l.get("id").getAsString();
            boolean mine = me != null && me.equals(l.get("owner").getAsString());
            container.setItem(slot, listingIcon(l, mine));
            if (!mine) {
                actions.put(slot, () -> doTake(player, id, list, me, page, totalPages));
            } else {
                actions.put(slot, () -> tell(player, "这是你自己的帖子，不能拍自己的～要下架去网页 /market/", COLOR_INFO));
            }
        }

        // 上一页
        if (page > 0) {
            ItemStack prev = named(Items.ARROW, "§a◀ 上一页");
            container.setItem(SLOT_PREV, prev);
            actions.put(SLOT_PREV, () -> openMarketGui(player, list, me, page - 1, totalPages));
        }
        // 挂商品
        ItemStack post = named(Items.NETHER_STAR, "§b✨ 挂商品");
        post.set(DataComponents.LORE, new ItemLore(List.of(
            Component.literal("§7卖东西 / 收东西 / 以物易物"),
            Component.literal("§7点击开始挂单")
        )));
        post.set(DataComponents.ENCHANTMENT_GLINT_OVERRIDE, true);
        container.setItem(SLOT_POST, post);
        actions.put(SLOT_POST, () -> { player.closeContainer(); openTypeMenu(player); });

        // 页码信息
        ItemStack info = named(Items.PAPER, "§e第 " + (page + 1) + " / " + totalPages + " 页");
        info.set(DataComponents.LORE, new ItemLore(List.of(
            Component.literal("§7共 §f" + list.size() + " §7件商品"),
            Component.literal("§8左键点商品直接拍下"),
            Component.literal("§8绿宝石=出售 金锭=收购 比较器=交换")
        )));
        container.setItem(SLOT_INFO, info);

        // 下一页
        if (page < totalPages - 1) {
            ItemStack next = named(Items.ARROW, "§a下一页 ▶");
            container.setItem(SLOT_NEXT, next);
            actions.put(SLOT_NEXT, () -> openMarketGui(player, list, me, page + 1, totalPages));
        }

        player.openMenu(new SimpleMenuProvider(
            (syncId, inv, p) -> new ActionChestMenu(MenuType.GENERIC_9x6, syncId, inv, container, MENU_ROWS, actions),
            Component.literal("§b🛍️ 二手交易 · 第 " + (page + 1) + " / " + totalPages + " 页")));
    }

    private ItemStack listingIcon(JsonObject l, boolean mine) {
        String type = l.get("type").getAsString();
        String item = l.get("item").getAsString();
        int price = l.has("price") ? l.get("price").getAsInt() : 0;
        String owner = l.get("owner").getAsString();
        String desc = l.has("desc") ? l.get("desc").getAsString() : "";

        ItemStack stack;
        if (mine) {
            stack = new ItemStack(Items.PLAYER_HEAD);
        } else {
            stack = new ItemStack(switch (type) {
                case "buy" -> Items.GOLD_INGOT;
                case "barter" -> Items.COMPARATOR;
                default -> Items.EMERALD;
            });
        }
        String tag = type.equals("sell") ? "§a[出售]" : (type.equals("buy") ? "§6[收购]" : "§d[交换]");
        String name = mine
            ? tag + " §7" + item + " §c（你的帖子）"
            : tag + " §f" + item + (type.equals("barter") ? "" : " §e" + price + "🪙");
        stack.set(DataComponents.CUSTOM_NAME, Component.literal(name));

        List<Component> lore = new ArrayList<>();
        lore.add(Component.literal("§7楼主: §f@" + owner));
        if (!desc.isEmpty()) lore.add(Component.literal("§7备注: §f" + desc));
        if (type.equals("sell") && !mine) {
            lore.add(Component.literal(""));
            lore.add(price == 0 ? Component.literal("§a免费送！点击认领") : Component.literal("§e💰 " + price + " 金币 · 点击拍下"));
        } else if (type.equals("buy") && !mine) {
            lore.add(Component.literal(""));
            lore.add(Component.literal("§6对方出 " + price + " 金币收，点击供货"));
        } else if (type.equals("barter") && !mine) {
            lore.add(Component.literal(""));
            lore.add(Component.literal("§d以物易物，点击发起交换"));
        }
        stack.set(DataComponents.LORE, new ItemLore(lore));
        return stack;
    }

    private ItemStack pane(String name) {
        ItemStack g = new ItemStack(Items.STAINED_GLASS_PANE.gray());
        g.set(DataComponents.CUSTOM_NAME, Component.literal(name));
        return g;
    }

    private ItemStack named(net.minecraft.world.item.Item item, String name) {
        ItemStack s = new ItemStack(item);
        s.set(DataComponents.CUSTOM_NAME, Component.literal(name));
        return s;
    }

    /** 点击格子能触发动作的箱子；没绑定动作的格子一律吞掉点击，东西拿不走 */
    private class ActionChestMenu extends ChestMenu {
        private final Map<Integer, Runnable> actions;

        ActionChestMenu(MenuType<?> type, int syncId, Inventory inv, Container container, int rows,
                        Map<Integer, Runnable> actions) {
            super(type, syncId, inv, container, rows);
            this.actions = actions;
        }

        @Override
        public void clicked(int slotId, int button, ContainerInput containerInput, Player player) {
            if (slotId >= 0 && slotId < MENU_SIZE) {
                Runnable a = actions.get(slotId);
                if (a != null) a.run();
            }
            // 任何点击都不移动物品
        }

        @Override
        public ItemStack quickMoveStack(Player player, int index) {
            return ItemStack.EMPTY;
        }
    }

    /* ================= 拍下 ================= */

    private void doTake(ServerPlayer player, String id, List<JsonObject> list, String me, int page, int totalPages) {
        String mcname = player.getName().getString();
        asyncPost("/api/mc/market/take", makeJson("id", id, "mcname", mcname), resp -> onMain(player, () -> {
            JsonObject root = resp.body() == null ? null : parseJson(resp.body());
            boolean ok = root != null && root.getAsJsonPrimitive("ok").getAsBoolean();
            if (!ok) {
                tell(player, "❌ " + niceError(resp, "拍下失败"), COLOR_WARN);
                return;
            }
            JsonObject listing = root.getAsJsonObject("listing");
            String item = listing.get("item").getAsString();
            String type = listing.get("type").getAsString();
            int price = listing.has("price") ? listing.get("price").getAsInt() : 0;
            String t = type.equals("sell") ? "买下" : (type.equals("buy") ? "供货" : "交换");
            player.closeContainer();
            tell(player, "✅ " + t + "成功：" + item + (price > 0 ? " · " + price + "🪙 已进担保" : "")
                + "\n💬 用 /buytell <消息> 与对方聊天，约好游戏内交货", COLOR_SELL);
        }));
    }

    private int cmdBuyTake(CommandContext<CommandSourceStack> ctx, String id) {
        ServerPlayer player = requirePlayer(ctx);
        if (player == null) return 0;
        doTake(player, id, null, null, 0, 1);
        return 1;
    }

    /* ================= /buysell 挂商品 ================= */

    private void openTypeMenu(ServerPlayer player) {
        int rows = 3, size = 27;
        SimpleContainer container = new SimpleContainer(size);
        Map<Integer, Runnable> actions = new ConcurrentHashMap<>();
        for (int s = 0; s < size; s++) container.setItem(s, pane(" "));

        ItemStack sell = named(Items.EMERALD, "§a🛒 我要卖东西");
        sell.set(DataComponents.LORE, new ItemLore(List.of(
            Component.literal("§7把游戏内物品卖给别人换金币"),
            Component.literal("§e点击选择")
        )));
        sell.set(DataComponents.ENCHANTMENT_GLINT_OVERRIDE, true);
        container.setItem(11, sell);
        actions.put(11, () -> startDraft(player, "sell"));

        ItemStack buy = named(Items.GOLD_INGOT, "§6🔎 我要收东西");
        buy.set(DataComponents.LORE, new ItemLore(List.of(
            Component.literal("§7出金币收购想要的物品"),
            Component.literal("§e点击选择")
        )));
        buy.set(DataComponents.ENCHANTMENT_GLINT_OVERRIDE, true);
        container.setItem(13, buy);
        actions.put(13, () -> startDraft(player, "buy"));

        ItemStack barter = named(Items.COMPARATOR, "§d🔄 以物易物");
        barter.set(DataComponents.LORE, new ItemLore(List.of(
            Component.literal("§7不用金币，拿东西换东西"),
            Component.literal("§e点击选择")
        )));
        barter.set(DataComponents.ENCHANTMENT_GLINT_OVERRIDE, true);
        container.setItem(15, barter);
        actions.put(15, () -> startDraft(player, "barter"));

        ItemStack info = named(Items.PAPER, "§e选一个挂单类型");
        info.set(DataComponents.LORE, new ItemLore(List.of(
            Component.literal("§7绿宝石=卖  金锭=收  比较器=换"),
            Component.literal("§8选完后在聊天里按提示填写")
        )));
        container.setItem(22, info);

        player.openMenu(new SimpleMenuProvider(
            (syncId, inv, p) -> new ActionChestMenu(MenuType.GENERIC_9x3, syncId, inv, container, rows, actions),
            Component.literal("§b✨ 挂商品 · 选类型")));
    }

    private void startDraft(ServerPlayer player, String type) {
        Draft d = new Draft();
        d.type = type;
        drafts.put(player.getUUID(), d);
        player.closeContainer();
        String typeName = type.equals("sell") ? "§a出售" : (type.equals("buy") ? "§6收购" : "§d以物易物");
        tell(player, Component.empty()
            .append(Component.literal("好，已选择：" + typeName + "\n").setStyle(Style.EMPTY.withColor(COLOR_TITLE)))
            .append(Component.literal("第 1 步：发送物品名称（40 字以内）\n").setStyle(Style.EMPTY.withColor(COLOR_INFO)))
            .append(suggest("/buysell name 钻石剑", "§e§n点这里填物品名")));
    }

    private int cmdDraftName(CommandContext<CommandSourceStack> ctx, String itemRaw) {
        ServerPlayer player = requirePlayer(ctx);
        if (player == null) return 0;
        Draft d = drafts.get(player.getUUID());
        if (d == null) { tell(player, "请先发 /buysell 选类型", COLOR_WARN); return 0; }
        String item = itemRaw.trim();
        if (item.isEmpty()) { tell(player, "物品名不能为空", COLOR_WARN); return 0; }
        if (item.length() > 40) { tell(player, "物品名不能超过 40 个字", COLOR_WARN); return 0; }
        d.item = item;
        if ("barter".equals(d.type)) {
            promptDesc(player, d);
        } else {
            tell(player, Component.empty()
                .append(Component.literal("收到：物品 = §f" + item + "\n").setStyle(Style.EMPTY.withColor(COLOR_TITLE)))
                .append(Component.literal("第 2 步：定价（整数金币，0 = 免费送）\n").setStyle(Style.EMPTY.withColor(COLOR_INFO)))
                .append(suggest("/buysell price 100", "§e§n点这里填价格")));
        }
        return 1;
    }

    private int cmdDraftPrice(CommandContext<CommandSourceStack> ctx, int price) {
        ServerPlayer player = requirePlayer(ctx);
        if (player == null) return 0;
        Draft d = drafts.get(player.getUUID());
        if (d == null || d.item == null) { tell(player, "请先发 /buysell 选类型并填物品名", COLOR_WARN); return 0; }
        d.price = price;
        promptDesc(player, d);
        return 1;
    }

    private void promptDesc(ServerPlayer player, Draft d) {
        tell(player, Component.empty()
            .append(Component.literal("定价：§e" + (d.price < 0 ? "以物易物" : d.price + "🪙") + "\n").setStyle(Style.EMPTY.withColor(COLOR_TITLE)))
            .append(Component.literal("第 3 步：备注可以不写，想写就点下面；不写直接发布\n").setStyle(Style.EMPTY.withColor(COLOR_INFO)))
            .append(suggest("/buysell desc 附附魔，耐久满", "§e§n点这里写备注"))
            .append(Component.literal("    "))
            .append(Component.literal("[直接发布 ✅]").setStyle(Style.EMPTY.withColor(COLOR_SELL).withBold(true)
                .withClickEvent(new ClickEvent.RunCommand("/buysell ok"))
                .withHoverEvent(new HoverEvent.ShowText(Component.literal("立即挂单"))))));
    }

    private int cmdDraftDesc(CommandContext<CommandSourceStack> ctx, String descRaw) {
        ServerPlayer player = requirePlayer(ctx);
        if (player == null) return 0;
        Draft d = drafts.get(player.getUUID());
        if (d == null || d.item == null) { tell(player, "请先发 /buysell 开始挂单", COLOR_WARN); return 0; }
        d.desc = descRaw.trim();
        if (d.desc.length() > 300) d.desc = d.desc.substring(0, 300);
        tell(player, Component.empty()
            .append(Component.literal("备注已保存。确认一下：\n").setStyle(Style.EMPTY.withColor(COLOR_TITLE)))
            .append(summary(d))
            .append(Component.literal("\n"))
            .append(Component.literal("[确认发布 ✅]").setStyle(Style.EMPTY.withColor(COLOR_SELL).withBold(true)
                .withClickEvent(new ClickEvent.RunCommand("/buysell ok"))
                .withHoverEvent(new HoverEvent.ShowText(Component.literal("立即挂单")))))
            .append(Component.literal("    "))
            .append(Component.literal("[取消]").setStyle(Style.EMPTY.withColor(COLOR_WARN)
                .withClickEvent(new ClickEvent.RunCommand("/buysell cancel")))));
        return 1;
    }

    private void submitDraft(ServerPlayer player) {
        Draft d = drafts.get(player.getUUID());
        if (d == null || d.item == null) { tell(player, "请先发 /buysell 开始挂单", COLOR_WARN); return; }
        if (!"barter".equals(d.type) && d.price < 0) { tell(player, "还没定价，点上一条提示填写", COLOR_WARN); return; }

        int price = "barter".equals(d.type) ? 0 : d.price;
        String mcname = player.getName().getString();
        asyncPost("/api/mc/market/post",
            makeJson("mcname", mcname, "type", d.type, "item", d.item, "desc", d.desc, "price", String.valueOf(price)),
            resp -> onMain(player, () -> {
                JsonObject root = resp.body() == null ? null : parseJson(resp.body());
                boolean ok = root != null && root.getAsJsonPrimitive("ok").getAsBoolean();
                if (!ok) {
                    tell(player, "❌ " + niceError(resp, "上架失败"), COLOR_WARN);
                    return;
                }
                drafts.remove(player.getUUID());
                tell(player, "✅ 上架成功：" + d.item + (price > 0 ? " · " + price + "🪙" : "")
                    + "\n发 /buy 就能在箱子里看到它", COLOR_SELL);
            }));
    }

    private void cancelDraft(ServerPlayer player) {
        drafts.remove(player.getUUID());
        tell(player, "已取消挂单", COLOR_INFO);
    }

    private MutableComponent summary(Draft d) {
        String typeName = d.type.equals("sell") ? "出售" : (d.type.equals("buy") ? "收购" : "以物易物");
        return Component.literal("§7类型: §f" + typeName + "  §7物品: §f" + d.item
            + ("barter".equals(d.type) ? "" : "  §7价格: §e" + Math.max(0, d.price) + "🪙")
            + (d.desc.isEmpty() ? "" : "\n§7备注: §f" + d.desc));
    }

    private MutableComponent suggest(String command, String label) {
        return Component.literal(label).setStyle(Style.EMPTY.withClickEvent(new ClickEvent.SuggestCommand(command))
            .withHoverEvent(new HoverEvent.ShowText(Component.literal("点击填入聊天框（可改完再发）"))));
    }

    /* ================= /buybind ================= */

    private int cmdBind(CommandContext<CommandSourceStack> ctx, String code) {
        ServerPlayer player = requirePlayer(ctx);
        if (player == null) return 0;
        String mcname = player.getName().getString();
        asyncPost("/api/mc/market/bind", makeJson("mcname", mcname, "code", code), resp -> onMain(player, () -> {
            JsonObject root = resp.body() == null ? null : parseJson(resp.body());
            boolean ok = root != null && root.getAsJsonPrimitive("ok").getAsBoolean();
            if (!ok) {
                tell(player, "❌ " + niceError(resp, "绑定失败"), COLOR_WARN);
                return;
            }
            String user = root.get("user").getAsString();
            tell(player, "✅ 绑定成功！MC 账号 " + mcname + " 已绑定网站用户 @" + user
                + "\n现在可以用 /buy 拍下、/buysell 挂商品了～", COLOR_SELL);
        }));
        return 1;
    }

    /* ================= /buytell ================= */

    private int cmdTell(CommandContext<CommandSourceStack> ctx, String message, int index) {
        ServerPlayer player = requirePlayer(ctx);
        if (player == null) return 0;
        String mcname = player.getName().getString();

        asyncGet("/api/mc/market/chats?mcname=" + enc(mcname), resp -> onMain(player, () -> {
            JsonObject root = resp.body() == null ? null : parseJson(resp.body());
            boolean ok = root != null && root.getAsJsonPrimitive("ok").getAsBoolean();
            if (!ok) {
                tell(player, "❌ " + niceError(resp, "获取交易列表失败"), COLOR_WARN);
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
            if (index < 1) {
                MutableComponent msg = Component.empty()
                    .append(Component.literal("💬 你有多个进行中的交易，用 /buytell <消息> <序号> 指定：\n")
                        .setStyle(Style.EMPTY.withColor(COLOR_TITLE).withBold(true)));
                for (int i = 0; i < chats.size(); i++) {
                    JsonObject c = chats.get(i).getAsJsonObject();
                    String item = c.get("item").getAsString();
                    String type = c.get("type").getAsString();
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
        }));
        return 1;
    }

    private void sendChatMessage(ServerPlayer player, String mcname, JsonObject chat, String text) {
        String lid = chat.get("id").getAsString();
        asyncPost("/api/mc/market/chat", makeJson("lid", lid, "mcname", mcname, "text", text),
            resp -> onMain(player, () -> {
                JsonObject root = resp.body() == null ? null : parseJson(resp.body());
                boolean ok = root != null && root.getAsJsonPrimitive("ok").getAsBoolean();
                if (!ok) {
                    tell(player, "❌ " + niceError(resp, "发送失败"), COLOR_WARN);
                    return;
                }
                tell(player, "📤 已发送", COLOR_INFO);
            }));
    }

    /* ================= HTTP 工具 ================= */

    /** 一次 HTTP 调用的结果：code=0 表示根本没连上（超时/DNS/被拦），其余是 HTTP 状态码 */
    private record Resp(int code, String body) {}

    private void asyncGet(String path, Consumer<Resp> cb) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(apiUrl + path))
                .timeout(Duration.ofSeconds(12))
                .GET();
        if (!secret.isBlank()) b.header("X-MC-Secret", secret);
        http.sendAsync(b.build(), HttpResponse.BodyHandlers.ofString())
                .thenAccept(r -> {
                    if (r.statusCode() == 401 || r.statusCode() == 403) {
                        System.out.println("[XRST-Market] 密钥被拒绝（" + r.statusCode()
                                + "），请检查 config/xrst-market.properties");
                    }
                    cb.accept(new Resp(r.statusCode(), r.body()));
                })
                .exceptionally(t -> { cb.accept(new Resp(0, null)); return null; });
    }

    private void asyncPost(String path, JsonObject body, Consumer<Resp> cb) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(apiUrl + path))
                .timeout(Duration.ofSeconds(12))
                .header("Content-Type", "application/json; charset=utf-8")
                .POST(HttpRequest.BodyPublishers.ofString(body.toString(), StandardCharsets.UTF_8));
        if (!secret.isBlank()) b.header("X-MC-Secret", secret);
        http.sendAsync(b.build(), HttpResponse.BodyHandlers.ofString())
                .thenAccept(r -> cb.accept(new Resp(r.statusCode(), r.body())))
                .exceptionally(t -> { cb.accept(new Resp(0, null)); return null; });
    }

    /** 把各种失败翻译成给玩家看的人话：优先显示后端返回的 error，而不是笼统的「连接失败」 */
    private String niceError(Resp resp, String fallback) {
        if (resp == null || resp.code() == 0) return fallback + "（连不上网站，稍后再试）";
        JsonObject o = resp.body() == null ? null : parseJson(resp.body());
        if (o != null && o.has("error") && !o.get("error").isJsonNull()) {
            return o.get("error").getAsString();
        }
        return fallback + "（网站返回 " + resp.code() + "）";
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
        return root != null && root.has("error") && !root.get("error").isJsonNull()
            ? root.get("error").getAsString() : fallback;
    }

    private String enc(String s) {
        return java.net.URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    /* ================= 线程 & 发消息 ================= */

    private void onMain(ServerPlayer p, Runnable r) {
        if (server == null) return;
        server.execute(r);
    }

    private void tell(ServerPlayer p, String text, int color) {
        tell(p, Component.literal(text).setStyle(Style.EMPTY.withColor(color)));
    }

    private void tell(ServerPlayer p, MutableComponent msg) {
        if (server == null) { p.sendSystemMessage(msg); return; }
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
        // 用户很容易在网址末尾多写一个 /，拼出 //api 导致 404，这里统一吃掉
        while (apiUrl.endsWith("/")) apiUrl = apiUrl.substring(0, apiUrl.length() - 1);
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
