"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
import { SwitchFade, motion } from "@/components/motion";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, Field, Input, PageHeader, Select, StatusBadge, SuccessNote, TextArea, fmtTime } from "@/components/ui";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  sort: number;
  active: number;
  stock: number;
  delivery_cmd: string;
  created_at: string;
}

interface Order {
  id: number;
  order_no: string;
  product_name: string;
  qty: number;
  total: number;
  currency: string;
  status: string;
  delivery: string | null;
  delivery_status: string | null;
  delivery_attempts: number | null;
  delivery_log: string | null;
  next_retry_at: string | null;
  mc_name: string | null;
  paid_at: string | null;
  created_at: string;
  username: string;
  provider?: string | null;
}

type Tab = "products" | "orders" | "economy";

interface EconomyConfigView {
  enabled: boolean;
  currency_name: string;
  balance_cmd: string;
  deduct_cmd: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  "epay:alipay": "支付宝",
  "epay:wxpay": "微信",
  "epay:qqpay": "QQ钱包",
  economy: "游戏币",
  manual: "手动/转账",
};

const providerLabel = (provider?: string | null): string => {
  if (!provider) return "—";
  return PROVIDER_LABELS[provider] ?? provider;
};

const DELIVERY_LABELS: Record<string, { label: string; color: "green" | "red" | "yellow" | "blue" | "gray" }> = {
  pending: { label: "待发货", color: "yellow" },
  sent: { label: "已自动发货", color: "green" },
  failed: { label: "发货失败", color: "red" },
  exhausted: { label: "重试耗尽", color: "red" },
  skipped: { label: "需手动发货", color: "blue" },
};

type OrderStatusFilter = "all" | "pending" | "paid" | "completed" | "cancelled";
type ProductStatusFilter = "all" | "active" | "inactive";

export default function AdminShopPage() {
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  // 商品表单
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [currency, setCurrency] = useState("CNY");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("0");
  const [active, setActive] = useState(true);
  const [stock, setStock] = useState("-1");
  const [deliveryCmd, setDeliveryCmd] = useState("");
  const [retryingOrderId, setRetryingOrderId] = useState<number | null>(null);

  // 发货
  const [deliverOrderId, setDeliverOrderId] = useState<number | null>(null);
  const [delivery, setDelivery] = useState("");

  // 经济插件配置
  const [eco, setEco] = useState<EconomyConfigView | null>(null);
  const [ecoPlayer, setEcoPlayer] = useState("");
  const [ecoTestOut, setEcoTestOut] = useState<string | null>(null);
  const [ecoBusy, setEcoBusy] = useState(false);

  const loadEconomy = useCallback(async () => {
    try {
      setEco(await api<EconomyConfigView>("/shop/admin/economy"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "经济配置加载失败");
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      setProducts(await api<Product[]>("/shop/admin/products"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      setOrders(await api<Order[]>("/shop/admin/orders"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadOrders();
    void loadEconomy();
  }, [loadProducts, loadOrders, loadEconomy]);

  const startCreate = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setPrice("0");
    setCurrency("CNY");
    setCategory("");
    setSort("0");
    setActive(true);
    setStock("-1");
    setDeliveryCmd("");
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setName(p.name);
    setDescription(p.description);
    setPrice(String(p.price));
    setCurrency(p.currency);
    setCategory(p.category);
    setSort(String(p.sort));
    setActive(p.active === 1);
    setStock(String(p.stock ?? -1));
    setDeliveryCmd(p.delivery_cmd ?? "");
  };

  const saveProduct = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const body = { name: name.trim(), description: description.trim(), price: Number(price), currency, category: category.trim(), sort: Number(sort), active, stock: Number.isFinite(Number(stock)) ? Math.trunc(Number(stock)) : -1, delivery_cmd: deliveryCmd.trim() };
      if (editingId) {
        await api(`/shop/admin/product/${editingId}/update`, { method: "POST", body: JSON.stringify(body) });
        setSuccess("商品已更新");
      } else {
        await api("/shop/admin/product", { method: "POST", body: JSON.stringify(body) });
        setSuccess("商品已创建");
        startCreate();
      }
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const removeProduct = async (p: Product) => {
    if (!window.confirm(`确认删除商品「${p.name}」？`)) return;
    setError("");
    setSuccess("");
    try {
      await api(`/shop/admin/product/${p.id}/delete`, { method: "POST" });
      if (editingId === p.id) startCreate();
      await loadProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const toggleActive = async (p: Product) => {
    setError("");
    try {
      await api(`/shop/admin/product/${p.id}/update`, {
        method: "POST",
        body: JSON.stringify({
          name: p.name,
          description: p.description,
          price: p.price,
          currency: p.currency,
          category: p.category,
          sort: p.sort,
          active: p.active !== 1,
          stock: p.stock,
          delivery_cmd: p.delivery_cmd,
        }),
      });
      await loadProducts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  };

  const deliver = async (e: FormEvent) => {
    e.preventDefault();
    if (!deliverOrderId) return;
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api(`/shop/admin/order/${deliverOrderId}/deliver`, { method: "POST", body: JSON.stringify({ delivery: delivery.trim() }) });
      setSuccess("订单已标记完成");
      setDeliverOrderId(null);
      setDelivery("");
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发货失败");
    } finally {
      setBusy(false);
    }
  };

  const retryDelivery = async (o: Order) => {
    setError("");
    setSuccess("");
    setRetryingOrderId(o.id);
    try {
      const r = await api<{ delivered: boolean; delivery_status: string; delivery_log: string }>(`/shop/admin/order/${o.id}/retry-delivery`, { method: "POST" });
      if (r.delivered) {
        setSuccess(`订单 ${o.order_no} 自动发货成功`);
      } else {
        setError(`自动发货失败：${r.delivery_log || "请检查 RCON 配置与玩家在线状态"}`);
      }
      await loadOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重试失败");
    } finally {
      setRetryingOrderId(null);
    }
  };

  const confirmPayment = async (o: Order) => {
    setError("");
    setSuccess("");
    setConfirmingOrderId(o.id);
    try {
      await api("/pay/verify", { method: "POST", body: JSON.stringify({ order_no: o.order_no }) });
      setSuccess("已确认收款");
      await loadOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : "确认收款失败");
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const copyOrderNo = async (orderNo: string) => {
    try {
      await navigator.clipboard.writeText(orderNo);
      setCopiedOrderNo(orderNo);
      window.setTimeout(() => {
        setCopiedOrderNo((cur) => (cur === orderNo ? null : cur));
      }, 1500);
    } catch {
      setError("复制失败，请手动复制订单号");
    }
  };

  // 商品筛选
  const [productKeyword, setProductKeyword] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("all");
  const [productStatusFilter, setProductStatusFilter] = useState<ProductStatusFilter>("all");

  // 订单筛选
  const [orderKeyword, setOrderKeyword] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<OrderStatusFilter>("all");
  const [copiedOrderNo, setCopiedOrderNo] = useState<string | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<number | null>(null);

  const productCategories = Array.from(
    new Set((products ?? []).map((p) => p.category).filter((c): c is string => !!c)),
  );

  const filteredProducts = (products ?? []).filter((p) => {
    if (productCategoryFilter !== "all" && p.category !== productCategoryFilter) return false;
    if (productStatusFilter === "active" && p.active !== 1) return false;
    if (productStatusFilter === "inactive" && p.active !== 0) return false;
    const kw = productKeyword.trim().toLowerCase();
    return !kw || `${p.name} ${p.category ?? ""}`.toLowerCase().includes(kw);
  });

  const filteredOrders = (orders ?? []).filter((o) => {
    if (orderStatusFilter !== "all" && o.status !== orderStatusFilter) return false;
    const kw = orderKeyword.trim().toLowerCase();
    return !kw || `${o.order_no} ${o.product_name ?? ""} ${o.username ?? ""}`.toLowerCase().includes(kw);
  });

  const settledOrders = (orders ?? []).filter((o) => o.status === "paid" || o.status === "completed");
  const revenue = settledOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const revenueCurrencies = Array.from(new Set(settledOrders.map((o) => o.currency).filter(Boolean)));
  const revenueCurrency = revenueCurrencies.length === 1 ? revenueCurrencies[0] : "CNY";
  const revenueMixed = revenueCurrencies.length > 1;

  const saveEconomy = async () => {
    if (!eco) return;
    setError("");
    setSuccess("");
    setEcoBusy(true);
    try {
      const saved = await api<EconomyConfigView>("/shop/admin/economy", {
        method: "POST",
        body: JSON.stringify({
          enabled: eco.enabled,
          currency_name: eco.currency_name,
          balance_cmd: eco.balance_cmd,
          deduct_cmd: eco.deduct_cmd,
        }),
      });
      setEco(saved);
      setSuccess("经济插件配置已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setEcoBusy(false);
    }
  };

  const testEconomy = async () => {
    if (!eco) return;
    setError("");
    setEcoTestOut(null);
    setEcoBusy(true);
    try {
      const r = await api<{ output: string; balance: number | null; parsed: boolean }>("/shop/admin/economy/test", {
        method: "POST",
        body: JSON.stringify({ balance_cmd: eco.balance_cmd, player: ecoPlayer.trim() }),
      });
      setEcoTestOut(r.parsed ? `解析成功：余额 = ${r.balance} ${eco.currency_name}\n原始输出：${r.output}` : `已执行但无法解析余额数字\n原始输出：${r.output}`);
    } catch (err) {
      setEcoTestOut(`测试失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setEcoBusy(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "products", label: "商品管理" },
    { key: "orders", label: "订单管理" },
    { key: "economy", label: "经济插件" },
  ];

  return (
    <AdminShell>
      <PageHeader title="商城管理" desc="商品上下架、订单收款与发货、经济插件对接" />

      <div className="flex gap-2 mb-5 p-1 bg-slate-50 rounded-[10px] w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-5 py-2 rounded-[8px] text-[0.88rem] font-semibold transition-all cursor-pointer ${
              tab === t.key ? "bg-accent-emerald/90 text-white" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <SwitchFade switchKey={tab}>
      {/* 统计卡（图13/14/15） */}
      {tab === "products" ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {[
            { label: "商品总数", value: products?.length ?? 0, tone: "green" },
            { label: "已上架", value: (products ?? []).filter((p) => p.active === 1).length, tone: "blue" },
            { label: "已下架", value: (products ?? []).filter((p) => p.active === 0).length, tone: "slate" },
            { label: "总订单", value: orders?.length ?? 0, tone: "amber" },
          ].map((c) => (
            <div key={c.label} className={`stat-card sc-${c.tone} rounded-[14px] p-4`}>
              <div className="text-[0.82rem] font-medium">{c.label}</div>
              <div className="text-[1.8rem] font-extrabold mt-1">{c.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4 mb-5">
          {[
            { label: "全部订单", value: String(orders?.length ?? 0), tone: "green", hint: "" },
            { label: "待支付", value: String((orders ?? []).filter((o) => o.status === "pending").length), tone: "amber", hint: "" },
            { label: "待发货", value: String((orders ?? []).filter((o) => o.status === "paid").length), tone: "pink", hint: "" },
            { label: "已完成", value: String((orders ?? []).filter((o) => o.status === "completed").length), tone: "blue", hint: "" },
            { label: "总成交额", value: `${revenue.toFixed(2)} ${revenueCurrency}`, tone: "slate", hint: revenueMixed ? "混合币种，仅统计展示" : "已支付 / 已完成订单" },
          ].map((c) => (
            <div key={c.label} className={`stat-card sc-${c.tone} rounded-[14px] p-4`}>
              <div className="text-[0.82rem] font-medium">{c.label}</div>
              <div className={`mt-1 font-extrabold ${c.label === "总成交额" ? "text-[1.55rem]" : "text-[1.8rem]"}`}>{c.value}</div>
              {c.hint && <div className="text-[0.72rem] opacity-70 mt-1">{c.hint}</div>}
            </div>
          ))}
        </div>
      )}

      <ErrorNote message={error} />
      <SuccessNote message={success} />

      {tab === "products" ? (
        <>
          <Card className="mb-5">
            <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">{editingId ? `编辑商品 #${editingId}` : "新增商品"}</h3>
            <form onSubmit={saveProduct} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="商品名">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="价格">
                    <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {[9.9, 19.9, 29.9, 49.9, 99].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setPrice(String(v))}
                          className={`px-2 py-0.5 rounded-[6px] text-[0.75rem] font-semibold border cursor-pointer transition-colors ${
                            Number(price) === v
                              ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="货币">
                    <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      <option value="CNY">CNY</option>
                      <option value="USD">USD</option>
                      <option value="JPY">JPY</option>
                    </Select>
                  </Field>
                </div>
                <Field label="分类">
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="如 会员 / 道具" maxLength={50} list="shop-product-categories" />
                  <datalist id="shop-product-categories">
                    {productCategories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="排序（小在前）">
                    <Input type="number" value={sort} onChange={(e) => setSort(e.target.value)} />
                  </Field>
                  <Field label="状态">
                    <Select value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
                      <option value="1">上架</option>
                      <option value="0">下架</option>
                    </Select>
                  </Field>
                </div>
                <Field label="库存" hint="-1 表示不限量；下单即占用，取消/超时自动归还">
                  <Input type="number" min="-1" value={stock} onChange={(e) => setStock(e.target.value)} />
                </Field>
                <Field label="自动发货指令" hint="留空则手动发货；支持 {player} {qty} {order_no} {product} {amount}">
                  <Input value={deliveryCmd} onChange={(e) => setDeliveryCmd(e.target.value)} maxLength={500} placeholder="give {player} diamond {qty}" />
                </Field>
              </div>
              <Field label="描述">
                <TextArea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
              </Field>
              <div className="flex gap-2">
                <Btn type="submit" disabled={busy}>{busy ? "保存中..." : "保存"}</Btn>
                {editingId && <Btn type="button" variant="ghost" onClick={startCreate}>取消编辑</Btn>}
              </div>
            </form>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-[1.05rem] font-bold text-slate-800">商品列表</h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-[150px]">
                  <Select value={productCategoryFilter} onChange={(e) => setProductCategoryFilter(e.target.value)}>
                    <option value="all">全部分类</option>
                    {productCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div className="w-[120px]">
                  <Select value={productStatusFilter} onChange={(e) => setProductStatusFilter(e.target.value as ProductStatusFilter)}>
                    <option value="all">全部状态</option>
                    <option value="active">上架</option>
                    <option value="inactive">下架</option>
                  </Select>
                </div>
                <input
                  value={productKeyword}
                  onChange={(e) => setProductKeyword(e.target.value)}
                  placeholder="搜索商品名称 / 分类..."
                  className="w-full sm:w-[240px] bg-slate-50 border border-slate-200 rounded-[10px] px-3.5 py-2 text-[0.88rem] text-slate-800 focus:outline-none focus:border-[#3b82f6] placeholder:text-slate-400"
                />
              </div>
            </div>
            {products === null ? (
              <Empty text="加载中..." />
            ) : products.length === 0 ? (
              <Empty text="还没有商品" />
            ) : filteredProducts.length === 0 ? (
              <Empty text="没有符合条件的商品" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.88rem]">
                  <thead>
                    <tr className="text-left text-slate-500 text-[0.8rem] border-b border-slate-200">
                      <th className="py-2.5 pr-3">ID</th>
                      <th className="py-2.5 pr-3">名称</th>
                      <th className="py-2.5 pr-3">价格</th>
                      <th className="py-2.5 pr-3">分类</th>
                      <th className="py-2.5 pr-3">库存</th>
                      <th className="py-2.5 pr-3">自动发货</th>
                      <th className="py-2.5 pr-3">排序</th>
                      <th className="py-2.5 pr-3">状态</th>
                      <th className="py-2.5">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {(filteredProducts).map((p, i) => (
                      <motion.tr
                        key={p.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.02 }}
                        className="hover:bg-slate-50"
                      >
                        <td className="py-3 pr-3 font-mono text-slate-500">{p.id}</td>
                        <td className="py-3 pr-3 font-medium text-slate-800">{p.name}</td>
                        <td className="py-3 pr-3 text-slate-600">{p.price} {p.currency}</td>
                        <td className="py-3 pr-3 text-slate-500">{p.category || "-"}</td>
                        <td className="py-3 pr-3">
                          {p.stock === -1 ? (
                            <span className="text-slate-400">不限</span>
                          ) : p.stock === 0 ? (
                            <Badge color="red">售罄</Badge>
                          ) : (
                            <span className={p.stock <= 5 ? "text-amber-600 font-semibold" : "text-slate-600"}>{p.stock}</span>
                          )}
                        </td>
                        <td className="py-3 pr-3">{p.delivery_cmd ? <Badge color="blue">已配置</Badge> : <span className="text-slate-400">手动</span>}</td>
                        <td className="py-3 pr-3 text-slate-500">{p.sort}</td>
                        <td className="py-3 pr-3">{p.active === 1 ? <Badge color="green">上架</Badge> : <Badge color="gray">下架</Badge>}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <Btn size="sm" variant="ghost" onClick={() => startEdit(p)}>编辑</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => toggleActive(p)}>{p.active === 1 ? "下架" : "上架"}</Btn>
                            <Btn size="sm" variant="danger" onClick={() => removeProduct(p)}>删除</Btn>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : tab === "economy" ? (
        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[1.05rem] font-bold text-slate-800">经济插件对接</h3>
            {eco?.enabled ? <Badge color="green">已启用</Badge> : <Badge color="gray">未启用</Badge>}
          </div>
          <p className="text-[0.82rem] text-slate-500 mb-4">
            通过 RCON 对接服务器内任意经济插件（EssentialsX / PlayerPoints / Vault 等）。玩家下单时自动查询余额并扣款，订单直接进入「已支付」。
          </p>
          {eco === null ? (
            <Empty text="加载中..." />
          ) : (
            <div className="flex flex-col gap-4">
              <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={eco.enabled}
                  onChange={(e) => setEco({ ...eco, enabled: e.target.checked })}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="text-[0.9rem] font-medium text-slate-700">启用游戏币支付</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="游戏币名称" hint="展示给用户，如：金币 / 点券">
                  <Input value={eco.currency_name} onChange={(e) => setEco({ ...eco, currency_name: e.target.value })} maxLength={20} />
                </Field>
              </div>
              <Field label="余额查询指令" hint="必须包含 {player} 占位符。示例：eco get {player}（EssentialsX）/ points me（PlayerPoints）">
                <Input value={eco.balance_cmd} onChange={(e) => setEco({ ...eco, balance_cmd: e.target.value })} maxLength={200} placeholder="eco get {player}" />
              </Field>
              <Field label="扣款指令" hint="必须包含 {player} 和 {amount}。示例：eco take {player} {amount} / points take {player} {amount}">
                <Input value={eco.deduct_cmd} onChange={(e) => setEco({ ...eco, deduct_cmd: e.target.value })} maxLength={200} placeholder="eco take {player} {amount}" />
              </Field>
              <div className="border-t border-slate-200 pt-4">
                <Field label="连通性测试" hint="对指定在线玩家执行一次余额查询，验证指令与输出解析是否正常">
                  <div className="flex gap-2">
                    <Input value={ecoPlayer} onChange={(e) => setEcoPlayer(e.target.value)} placeholder="测试玩家名（需在线）" maxLength={40} />
                    <Btn type="button" variant="ghost" onClick={testEconomy} disabled={ecoBusy || !ecoPlayer.trim()}>测试</Btn>
                  </div>
                </Field>
                {ecoTestOut && (
                  <pre className="mt-3 p-3 bg-slate-50 rounded-[10px] text-[0.78rem] text-slate-600 whitespace-pre-wrap break-all max-h-[180px] overflow-auto">{ecoTestOut}</pre>
                )}
              </div>
              <div className="flex gap-2">
                <Btn onClick={saveEconomy} disabled={ecoBusy}>{ecoBusy ? "保存中..." : "保存配置"}</Btn>
              </div>
              <p className="text-[0.78rem] text-slate-500">
                前提：在「服务器监控」中为服务器填写 RCON 地址与密码（页面使用第一台已配置 RCON 密码的服务器）；玩家通过入服申请或微软绑定关联游戏 ID。
              </p>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-[1.05rem] font-bold text-slate-800">订单列表</h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-[130px]">
                <Select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value as OrderStatusFilter)}>
                  <option value="all">全部状态</option>
                  <option value="pending">待支付</option>
                  <option value="paid">待发货</option>
                  <option value="completed">已完成</option>
                  <option value="cancelled">已取消</option>
                </Select>
              </div>
              <input
                value={orderKeyword}
                onChange={(e) => setOrderKeyword(e.target.value)}
                placeholder="搜索订单号 / 商品名 / 用户名..."
                className="w-full sm:w-[260px] bg-slate-50 border border-slate-200 rounded-[10px] px-3.5 py-2 text-[0.88rem] text-slate-800 focus:outline-none focus:border-[#3b82f6] placeholder:text-slate-400"
              />
            </div>
          </div>
          {orders === null ? (
            <Empty text="加载中..." />
          ) : orders.length === 0 ? (
            <Empty text="暂无订单" />
          ) : filteredOrders.length === 0 ? (
            <Empty text="没有符合条件的订单" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.88rem]">
                <thead>
                  <tr className="text-left text-slate-500 text-[0.8rem] border-b border-slate-200">
                    <th className="py-2.5 pr-3">订单号</th>
                    <th className="py-2.5 pr-3">商品</th>
                    <th className="py-2.5 pr-3">买家</th>
                    <th className="py-2.5 pr-3">金额</th>
                    <th className="py-2.5 pr-3">支付方式</th>
                    <th className="py-2.5 pr-3">状态</th>
                    <th className="py-2.5 pr-3">发货</th>
                    <th className="py-2.5 pr-3">时间</th>
                    <th className="py-2.5">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {filteredOrders.map((o, i) => (
                    <motion.tr
                      key={o.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.02 }}
                      className="hover:bg-slate-50"
                    >
                      <td className="py-3 pr-3 font-mono text-slate-500 text-[0.8rem]">{o.order_no}</td>
                      <td className="py-3 pr-3 text-slate-800">{o.product_name} × {o.qty}</td>
                      <td className="py-3 pr-3 text-slate-500">{o.username}{o.mc_name ? <span className="block text-[0.72rem] text-slate-400">游戏名：{o.mc_name}</span> : null}</td>
                      <td className="py-3 pr-3 text-slate-600">{o.total} {o.currency}</td>
                      <td className="py-3 pr-3 text-slate-500">{providerLabel(o.provider)}</td>
                      <td className="py-3 pr-3"><StatusBadge status={o.status} /></td>
                      <td className="py-3 pr-3">
                        {(() => {
                          const d = o.delivery_status ? DELIVERY_LABELS[o.delivery_status] : null;
                          if (!d) return <span className="text-slate-400">—</span>;
                          return (
                            <div className="flex flex-col gap-1 items-start">
                              <Badge color={d.color}>{d.label}</Badge>
                              {(o.delivery_status === "failed" || o.delivery_status === "exhausted") && (
                                <span className="text-[0.72rem] text-slate-400">
                                  重试 {o.delivery_attempts ?? 0} 次{o.next_retry_at ? ` · 下次 ${fmtTime(o.next_retry_at)}` : ""}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 pr-3 text-slate-500">{fmtTime(o.created_at)}</td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {o.status === "pending" && (
                            <Btn size="sm" onClick={() => confirmPayment(o)} disabled={confirmingOrderId === o.id}>
                              {confirmingOrderId === o.id ? "确认中..." : "确认收款"}
                            </Btn>
                          )}
                          {o.status === "paid" && (
                            <Btn size="sm" variant="ghost" onClick={() => { setDeliverOrderId(o.id); setDelivery(""); }}>发货</Btn>
                          )}
                          {o.status === "paid" && (o.delivery_status === "failed" || o.delivery_status === "exhausted") && (
                            <Btn size="sm" variant="subtle" onClick={() => retryDelivery(o)} disabled={retryingOrderId === o.id}>
                              {retryingOrderId === o.id ? "重试中..." : "重试自动发货"}
                            </Btn>
                          )}
                          {o.status === "completed" && (
                            <span className="text-[0.78rem] text-slate-500 truncate max-w-[140px] inline-block align-middle">{o.delivery || "已发货"}</span>
                          )}
                          <Btn size="sm" variant="subtle" onClick={() => copyOrderNo(o.order_no)}>
                            {copiedOrderNo === o.order_no ? "已复制" : "复制订单号"}
                          </Btn>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {deliverOrderId !== null && (
            <form onSubmit={deliver} className="mt-5 border-t border-slate-200 pt-4">
              <Field label={`订单 #${deliverOrderId} 发货信息`} hint="填写发放方式/信息，提交后订单标记为已完成">
                <TextArea value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="如：已发放 100 金币至玩家 Steve_01" maxLength={2000} required />
              </Field>
              <div className="mt-3 flex gap-2">
                <Btn type="submit" disabled={busy}>{busy ? "提交中..." : "确认发货"}</Btn>
                <Btn type="button" variant="ghost" onClick={() => setDeliverOrderId(null)}>取消</Btn>
              </div>
            </form>
          )}
        </Card>
      )}
      </SwitchFade>
    </AdminShell>
  );
}
