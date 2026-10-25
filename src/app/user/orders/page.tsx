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

  // 经济支付
  const [ecoEnabled, setEcoEnabled] = useState(false);
  const [ecoCurrency, setEcoCurrency] = useState("金币");
  const [mcName, setMcName] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // 在线支付（易支付）
  const [epayEnabled, setEpayEnabled] = useState(false);
  const [payTypes, setPayTypes] = useState<string[]>([]);
  const [payType, setPayType] = useState("alipay");
  const [payMethod, setPayMethod] = useState<"economy" | "epay" | "manual">("manual");

  const PAY_TYPE_LABELS: Record<string, string> = { alipay: "支付宝", wxpay: "微信支付", qqpay: "QQ 钱包" };

  const load = useCallback(async () => {
    try {
      const [p, o, info, pay] = await Promise.all([
        api<Product[]>("/shop/products"),
        api<Order[]>("/shop/orders"),
        api<{ enabled: boolean; currency_name?: string; mc_name?: string | null; bound?: boolean }>("/shop/economy-info"),
        api<{ epay: { enabled: boolean; types: string[] } }>("/pay/config").catch(() => ({ epay: { enabled: false, types: [] } })),
      ]);
      setProducts(p);
      setOrders(o);
      if (info.enabled && info.mc_name) {
        setEcoEnabled(true);
        setEcoCurrency(info.currency_name || "金币");
        setMcName(info.mc_name || "");
      }
      if (pay.epay.enabled) {
        setEpayEnabled(true);
        setPayTypes(pay.epay.types);
        if (pay.epay.types.length > 0) setPayType(pay.epay.types[0]);
        setPayMethod("epay");
      } else if (info.enabled && info.mc_name) {
        setPayMethod("economy");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const r = await api<{ balance: number }>("/shop/balance");
      setBalance(r.balance);
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ecoEnabled) void refreshBalance();
  }, [ecoEnabled, refreshBalance]);

  const buy = async (productId: number, qty = 1) => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const data = await api<{ order_id: number; order_no: string; total: number; currency: string; status: string; economy_paid: boolean }>("/shop/order", {
        method: "POST",
        body: JSON.stringify({ product_id: productId, qty, payment_method: payMethod === "economy" && ecoEnabled ? "economy" : "manual" }),
      });
      if (data.economy_paid) {
        setSuccess(`支付成功！订单 ${data.order_no} 已扣除 ${data.total} ${data.currency}，等待管理员发货。`);
        void refreshBalance();
      } else if (payMethod === "epay" && epayEnabled) {
        const pay = await api<{ pay_url: string }>("/pay/create", {
          method: "POST",
          body: JSON.stringify({ order_id: data.order_id, provider: "epay", pay_type: payType }),
        });
        if (pay.pay_url) {
          window.location.href = pay.pay_url;
          return;
        }
        setSuccess(`订单已创建：${data.order_no}，请前往支付。`);
      } else {
        setSuccess(`订单已创建：${data.order_no}，应付 ${data.total} ${data.currency}。请按商品说明联系管理员转账，管理员确认收款后订单状态会更新为「已支付」。`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "下单失败");
    } finally {
      setBusy(false);
    }
  };

  /** 待支付订单：重新发起在线支付 */
  const payOrder = async (o: Order) => {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const pay = await api<{ pay_url: string }>("/pay/create", {
        method: "POST",
        body: JSON.stringify({ order_id: o.id, provider: "epay", pay_type: payType }),
      });
      if (pay.pay_url) window.location.href = pay.pay_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "发起支付失败");
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-[1.05rem] font-bold text-slate-800">商城商品</h3>
          {ecoEnabled && (
            <div className="flex items-center gap-2 text-[0.82rem]">
              <span className="text-slate-500">
                {mcName ? `游戏币余额（${mcName}）：` : "游戏币余额："}
              </span>
              <span className="font-bold text-accent-emerald">
                {balanceLoading ? "查询中..." : balance !== null ? `${balance} ${ecoCurrency}` : "获取失败"}
              </span>
              <Btn size="sm" variant="ghost" onClick={refreshBalance} disabled={balanceLoading}>刷新</Btn>
            </div>
          )}
        </div>
        {(ecoEnabled || epayEnabled) && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {ecoEnabled && (
              <button
                type="button"
                onClick={() => setPayMethod("economy")}
                className={`px-4 py-1.5 rounded-[8px] text-[0.84rem] font-medium border transition-all cursor-pointer ${
                  payMethod === "economy" ? "bg-accent-emerald/10 border-accent-emerald text-accent-emerald" : "border-slate-200 text-slate-500 hover:text-slate-700"
                }`}
              >
                游戏币支付（{ecoCurrency}）
              </button>
            )}
            {epayEnabled && (
              <button
                type="button"
                onClick={() => setPayMethod("epay")}
                className={`px-4 py-1.5 rounded-[8px] text-[0.84rem] font-medium border transition-all cursor-pointer ${
                  payMethod === "epay" ? "bg-accent-emerald/10 border-accent-emerald text-accent-emerald" : "border-slate-200 text-slate-500 hover:text-slate-700"
                }`}
              >
                在线支付
              </button>
            )}
            <button
              type="button"
              onClick={() => setPayMethod("manual")}
              className={`px-4 py-1.5 rounded-[8px] text-[0.84rem] font-medium border transition-all cursor-pointer ${
                payMethod === "manual" ? "bg-accent-emerald/10 border-accent-emerald text-accent-emerald" : "border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
            >
              转账支付（联系管理员）
            </button>
            {payMethod === "epay" && payTypes.length > 0 && (
              <select
                value={payType}
                onChange={(e) => setPayType(e.target.value)}
                className="px-3 py-1.5 rounded-[8px] border border-slate-200 bg-white text-[0.84rem] text-slate-700 focus:outline-none focus:border-accent-emerald"
              >
                {payTypes.map((t) => (
                  <option key={t} value={t}>{PAY_TYPE_LABELS[t] || t}</option>
                ))}
              </select>
            )}
          </div>
        )}
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
          {epayEnabled
            ? "在线支付：下单后跳转服务商收银台完成付款，支付成功后订单自动更新为「已支付」；游戏币支付按服务器内经济插件实时结算；转账支付需联系管理员确认收款。"
            : ecoEnabled
              ? "选择「游戏币支付」下单即自动扣款（按服务器内经济插件实时结算）；选择「转账支付」则联系管理员确认收款后订单标记为「已支付」。"
              : "说明：下单后请联系管理员完成转账，管理员在后台确认收款后订单才会标记为「已支付」。"}
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
              <tbody className="divide-y divide-slate-100">
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
                        epayEnabled ? (
                          <Btn size="sm" disabled={busy} onClick={() => void payOrder(o)}>立即支付</Btn>
                        ) : (
                          <span className="text-[0.75rem] text-slate-500">待管理员确认收款</span>
                        )
                      )}
                      {o.status === "paid" && <span className="text-[0.75rem] text-slate-500">待发货</span>}
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