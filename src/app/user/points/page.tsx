"use client";

import { useCallback, useEffect, useState } from "react";
import { UserShell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api";
import { Badge, Btn, Card, ErrorNote, Field, Input, PageHeader, Spinner, SuccessNote, fmtTime } from "@/components/ui";

interface PointsLog {
  amount: number;
  reason: string;
  detail: string;
  created_at: string;
}

interface PointsData {
  points: number;
  history: PointsLog[];
  checkin: { checked_in: boolean; streak: number; next_points: number };
  exchange: {
    enabled: boolean;
    currency_name: string;
    points_per_currency: number;
    min_exchange: number;
    mc_name: string | null;
    bound: boolean;
  };
  config: {
    enabled: boolean;
    signin_base: number;
    signin_streak_bonus: number;
    signin_streak_max: number;
    post_points: number;
    comment_points: number;
    like_points: number;
    post_daily_limit: number;
    comment_daily_limit: number;
    like_daily_limit: number;
  };
}

const REASON_LABEL: Record<string, string> = {
  checkin: "每日签到",
  post: "发布帖子",
  comment: "发表评论",
  like_received: "帖子获赞",
  exchange: "兑换游戏币",
  admin: "管理员调整",
};

export default function UserPointsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<PointsData | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [checking, setChecking] = useState(false);
  const [amount, setAmount] = useState("");
  const [exchanging, setExchanging] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<PointsData>("/points");
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "积分信息加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return <UserShell><></></UserShell>;

  const checkin = async () => {
    setError("");
    setSuccess("");
    setChecking(true);
    try {
      const res = await api<{ gained: number; streak: number; points: number }>("/forum/checkin", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSuccess(`签到成功，获得 ${res.gained} 积分，已连续签到 ${res.streak} 天`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "签到失败");
    } finally {
      setChecking(false);
    }
  };

  const exchange = async () => {
    setError("");
    setSuccess("");
    const value = Math.floor(Number(amount));
    if (!value) {
      setError("请输入要使用的积分数量");
      return;
    }
    setExchanging(true);
    try {
      const res = await api<{ points: number; cost: number; amount: number; currency_name: string }>("/points/exchange", {
        method: "POST",
        body: JSON.stringify({ amount: value }),
      });
      setSuccess(`兑换成功：${res.cost} 积分 → ${res.amount} ${res.currency_name}`);
      setAmount("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "兑换失败");
    } finally {
      setExchanging(false);
    }
  };

  const rate = data?.exchange.points_per_currency || 100;
  const preview = Math.floor((Number(amount) || 0) / rate);

  return (
    <UserShell>
      <PageHeader title="积分中心" desc="签到、发帖、评论都能获得积分，可兑换游戏币。" />

      {data === null ? (
        <Spinner text="加载积分…" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="flex flex-col gap-4">
            <Card className="text-center">
              <div className="text-[0.82rem] text-slate-500">当前积分</div>
              <div className="mt-1 text-[2.6rem] font-extrabold text-emerald-600 leading-none">{data.points}</div>
              <div className="mt-3 flex items-center justify-center gap-2">
                {data.checkin.checked_in ? (
                  <Badge color="green">今日已签到</Badge>
                ) : (
                  <Badge color="yellow">连续 {data.checkin.streak} 天</Badge>
                )}
              </div>
              <div className="mt-4">
                <Btn onClick={() => void checkin()} disabled={checking || data.checkin.checked_in} className="w-full">
                  {data.checkin.checked_in ? "今天已经签过啦" : checking ? "签到中…" : `签到领 ${data.checkin.next_points} 积分`}
                </Btn>
              </div>
            </Card>

            <Card>
              <h3 className="text-[0.95rem] font-bold text-slate-800 mb-3">积分获取方式</h3>
              <ul className="flex flex-col gap-2.5 text-[0.82rem]">
                <Rule label="每日签到" value={`${data.config.signin_base} 分起`} hint={`连续签到每天 +${data.config.signin_streak_bonus}，最多 +${data.config.signin_streak_max * data.config.signin_streak_bonus}`} />
                <Rule label="发布帖子" value={`+${data.config.post_points}`} hint={data.config.post_daily_limit ? `每日最多 ${data.config.post_daily_limit} 分` : "不限次数"} />
                <Rule label="发表评论" value={`+${data.config.comment_points}`} hint={data.config.comment_daily_limit ? `每日最多 ${data.config.comment_daily_limit} 分` : "不限次数"} />
                <Rule label="帖子获赞" value={`+${data.config.like_points}`} hint={data.config.like_daily_limit ? `每日最多 ${data.config.like_daily_limit} 分` : "不限次数"} />
              </ul>
            </Card>

            <Card>
              <h3 className="text-[0.95rem] font-bold text-slate-800 mb-1">积分兑换</h3>
              <p className="text-[0.8rem] text-slate-400 mb-3">
                {data.exchange.enabled
                  ? `${rate} 积分 = 1 ${data.exchange.currency_name}，单次至少 ${data.exchange.min_exchange} 积分`
                  : "管理员暂未开启积分兑换"}
              </p>
              {data.exchange.enabled ? (
                <>
                  <div className="text-[0.8rem] text-slate-500 mb-2">
                    发放到：{data.exchange.mc_name ? <span className="font-mono text-slate-700">{data.exchange.mc_name}</span> : "尚未绑定游戏角色"}
                  </div>
                  <Field label="使用积分">
                    <Input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))}
                      placeholder={`最少 ${data.exchange.min_exchange}`}
                      inputMode="numeric"
                    />
                  </Field>
                  <p className="mt-1.5 text-[0.78rem] text-slate-400">预计获得 {preview} {data.exchange.currency_name}</p>
                  <Btn
                    className="mt-3 w-full"
                    onClick={() => void exchange()}
                    disabled={exchanging || !data.exchange.bound || !amount}
                  >
                    {exchanging ? "兑换中…" : data.exchange.bound ? "立即兑换" : "请先绑定游戏角色"}
                  </Btn>
                </>
              ) : null}
            </Card>
          </div>

          <Card className="lg:col-span-2">
            <h3 className="text-[0.95rem] font-bold text-slate-800 mb-3">积分明细</h3>
            <div className="flex flex-col gap-2">
              <ErrorNote message={error} />
              <SuccessNote message={success} />
            </div>
            {data.history.length === 0 ? (
              <p className="py-10 text-center text-[0.85rem] text-slate-400">还没有积分记录，去签到或发帖试试吧。</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.history.map((log, i) => (
                  <li key={`${log.created_at}-${i}`} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.88rem] font-medium text-slate-700">{REASON_LABEL[log.reason] || log.reason}</p>
                      <p className="truncate text-[0.75rem] text-slate-400">
                        {log.detail || "—"} · {fmtTime(log.created_at)}
                      </p>
                    </div>
                    <span className={`text-[0.95rem] font-bold ${log.amount >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                      {log.amount >= 0 ? "+" : ""}{log.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </UserShell>
  );
}

function Rule({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <li className="flex items-start justify-between gap-3">
      <div>
        <p className="font-medium text-slate-700">{label}</p>
        <p className="text-[0.75rem] text-slate-400">{hint}</p>
      </div>
      <span className="shrink-0 font-bold text-emerald-600">{value}</span>
    </li>
  );
}
