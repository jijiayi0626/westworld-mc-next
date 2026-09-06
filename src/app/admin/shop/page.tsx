"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/Shell";
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
  paid_at: string | null;
  created_at: string;
  username: string;
}

type Tab = "products" | "orders";

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

  // 发货
  const [deliverOrderId, setDeliverOrderId] = useState<number | null>(null);
  const [delivery, setDelivery] = useState("");

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
  }, [loadProducts, loadOrders]);

  const startCreate = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setPrice("0");
    setCurrency("CNY");
    setCategory("");
    setSort("0");
    setActive(true);
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
  };

  const saveProduct = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const body = { name: name.trim(), description: description.trim(), price: Number(price), currency, category: category.trim(), sort: Number(sort), active };
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

  const removeProduct = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      await api(`/shop/admin/product/${id}/delete`, { method: "POST" });
      if (editingId === id) startCreate();
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

  const tabs: { key: Tab; label: string }[] = [
    { key: "products", label: "商品管理" },
    { key: "orders", label: "订单管理" },
  ];

  return (
    <AdminShell>
      <PageHeader title="商城管理" desc="商品上下架与订单发货" />

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
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="如 会员 / 道具" maxLength={50} />
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
            <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">商品列表</h3>
            {products === null ? (
              <Empty text="加载中..." />
            ) : products.length === 0 ? (
              <Empty text="还没有商品" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.88rem]">
                  <thead>
                    <tr className="text-left text-slate-500 text-[0.8rem] border-b border-slate-200">
                      <th className="py-2.5 pr-3">ID</th>
                      <th className="py-2.5 pr-3">名称</th>
                      <th className="py-2.5 pr-3">价格</th>
                      <th className="py-2.5 pr-3">分类</th>
                      <th className="py-2.5 pr-3">排序</th>
                      <th className="py-2.5 pr-3">状态</th>
                      <th className="py-2.5">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-3 pr-3 font-mono text-slate-500">{p.id}</td>
                        <td className="py-3 pr-3 font-medium text-slate-800">{p.name}</td>
                        <td className="py-3 pr-3 text-slate-600">{p.price} {p.currency}</td>
                        <td className="py-3 pr-3 text-slate-500">{p.category || "-"}</td>
                        <td className="py-3 pr-3 text-slate-500">{p.sort}</td>
                        <td className="py-3 pr-3">{p.active === 1 ? <Badge color="green">上架</Badge> : <Badge color="gray">下架</Badge>}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <Btn size="sm" variant="ghost" onClick={() => startEdit(p)}>编辑</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => toggleActive(p)}>{p.active === 1 ? "下架" : "上架"}</Btn>
                            <Btn size="sm" variant="danger" onClick={() => removeProduct(p.id)}>删除</Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">订单列表</h3>
          {orders === null ? (
            <Empty text="加载中..." />
          ) : orders.length === 0 ? (
            <Empty text="暂无订单" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.88rem]">
                <thead>
                  <tr className="text-left text-slate-500 text-[0.8rem] border-b border-slate-200">
                    <th className="py-2.5 pr-3">订单号</th>
                    <th className="py-2.5 pr-3">商品</th>
                    <th className="py-2.5 pr-3">买家</th>
                    <th className="py-2.5 pr-3">金额</th>
                    <th className="py-2.5 pr-3">状态</th>
                    <th className="py-2.5 pr-3">时间</th>
                    <th className="py-2.5">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="py-3 pr-3 font-mono text-slate-500 text-[0.8rem]">{o.order_no}</td>
                      <td className="py-3 pr-3 text-slate-800">{o.product_name} × {o.qty}</td>
                      <td className="py-3 pr-3 text-slate-500">{o.username}</td>
                      <td className="py-3 pr-3 text-slate-600">{o.total} {o.currency}</td>
                      <td className="py-3 pr-3"><StatusBadge status={o.status} /></td>
                      <td className="py-3 pr-3 text-slate-500">{fmtTime(o.created_at)}</td>
                      <td className="py-3">
                        {o.status !== "completed" ? (
                          <Btn size="sm" variant="ghost" onClick={() => { setDeliverOrderId(o.id); setDelivery(""); }}>发货</Btn>
                        ) : (
                          <span className="text-[0.78rem] text-slate-500 truncate max-w-[140px] inline-block align-middle">{o.delivery || "已发货"}</span>
                        )}
                      </td>
                    </tr>
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
    </AdminShell>
  );
}
