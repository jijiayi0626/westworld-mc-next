"use client";

import { useCallback, useEffect, useState } from "react";
import { UserShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, Empty, PageHeader, StatusBadge, fmtTime, ErrorNote, SuccessNote, Badge } from "@/components/ui";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  active: number;
}

interface Order {
  id: number;
  order_no: string;
  product_name: string;
  qty: number;
  total: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export default function OrdersPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([
        api<Product[]>("/shop/products"),
        api<Order[]>("/shop/orders"),
      ]);
      setProducts(p);
      setOrders(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const buy = async (productId: number, qty = 1) => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const data = await api<{ order_id: number; order_no: string; total: number; currency: string }>("/shop/order", {
        method: "POST",
        body: JSON.stringify({ product_id: productId, qty }),
      });
      setSuccess(`订单已创建：${data.order_no}，应付 ${data.total} ${data.currency}。联系管理员转账后点击「模拟支付」即可标记已付。`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "下单失败");
    } finally {
      setBusy(false);
    }
  };

  const simulatePay = async (orderNo: string) => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/pay/verify", { method: "POST", body: JSON.stringify({ order_no: orderNo }) });
      setSuccess("已模拟支付成功");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "支付失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <UserShell>
      <PageHeader title="我的订单" desc="商城订单与支付状态" />

      <ErrorNote message={error} />
      <SuccessNote message={success} />

      {/* 商城商品 */}
      <Card className="mt-4 mb-5">
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">商城商品</h3>
        {products === null ? (
          <Empty text="加载中..." />
        ) : products.length === 0 ? (
          <Empty text="暂无可购买商品" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => (
              <div key={p.id} className="glass-card p-5 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-800 font-semibold">{p.name}</span>
                  <Badge color="gray">{p.category || "综合"}</Badge>
                </div>
                <p className="text-[0.82rem] text-slate-500 flex-1">{p.description || "暂无描述"}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-accent-emerald font-bold text-[1.05rem]">{p.price} {p.currency}</span>
                  <Btn size="sm" disabled={busy} onClick={() => buy(p.id)}>购买</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-[0.78rem] text-slate-500">
          说明：当前支付为演示模式，下单后需联系管理员转账，再在订单列表点击「模拟支付」标记已付。接入真实支付后此提示会移除。
        </p>
      </Card>

      {/* 我的订单 */}
      <Card>
        <h3 className="text-[1.05rem] font-bold text-slate-800 mb-4">订单列表</h3>
        {orders === null ? (
          <Empty text="加载中..." />
        ) : orders.length === 0 ? (
          <Empty text="还没有订单" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[0.85rem]">
              <thead>
                <tr className="text-slate-500 text-[0.78rem] border-b border-slate-200">
                  <th className="py-2.5 pr-3 font-medium">订单号</th>
                  <th className="py-2.5 pr-3 font-medium">商品</th>
                  <th className="py-2.5 pr-3 font-medium">数量</th>
                  <th className="py-2.5 pr-3 font-medium">金额</th>
                  <th className="py-2.5 pr-3 font-medium">状态</th>
                  <th className="py-2.5 pr-3 font-medium">下单时间</th>
                  <th className="py-2.5 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.map((o) => (
                  <tr key={o.id} className="text-slate-600">
                    <td className="py-3 pr-3 font-mono text-[0.78rem]">{o.order_no}</td>
                    <td className="py-3 pr-3">{o.product_name}</td>
                    <td className="py-3 pr-3">{o.qty}</td>
                    <td className="py-3 pr-3 text-accent-emerald font-semibold">{o.total} {o.currency}</td>
                    <td className="py-3 pr-3"><StatusBadge status={o.status} /></td>
                    <td className="py-3 pr-3 whitespace-nowrap text-slate-500">{fmtTime(o.created_at)}</td>
                    <td className="py-3">
                      {o.status === "pending" && (
                        <Btn variant="ghost" size="sm" disabled={busy} onClick={() => simulatePay(o.order_no)}>模拟支付</Btn>
                      )}
                      {o.status === "completed" && <span className="text-[0.75rem] text-slate-500">已交付</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </UserShell>
  );
}