"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, ErrorNote, Field, Input, PageHeader, Spinner, SuccessNote } from "@/components/ui";

interface PointsConfig {
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
  exchange_enabled: boolean;
  points_per_currency: number;
  min_exchange: number;
}

const DEFAULT: PointsConfig = {
  enabled: true,
  signin_base: 5,
  signin_streak_bonus: 1,
  signin_streak_max: 5,
  post_points: 2,
  comment_points: 1,
  like_points: 1,
  post_daily_limit: 10,
  comment_daily_limit: 20,
  like_daily_limit: 20,
  exchange_enabled: false,
  points_per_currency: 100,
  min_exchange: 100,
};

export default function AdminPointsPage() {
  const [config, setConfig] = useState<PointsConfig | null>(null);
  const [stats, setStats] = useState({ total_points: 0, today_issued: 0 });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ config: PointsConfig; stats: { total_points: number; today_issued: number } }>("/points/admin/config")
      .then((data) => {
        setConfig({ ...DEFAULT, ...data.config });
        setStats(data.stats);
      })
      .catch((e) => {
        setConfig({ ...DEFAULT });
        setError(e instanceof Error ? e.message : "积分配置加载失败");
      });
  }, []);

  const setNum = (key: keyof PointsConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig((prev) => (prev ? { ...prev, [key]: Number(e.target.value.replace(/\D/g, "")) } : prev));
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api("/points/admin/config", { method: "POST", body: JSON.stringify(config) });
      setSuccess("积分配置已保存，新行为立即生效");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="积分中心"
        desc="配置积分获取方式、每日额度与游戏币兑换比例。"
        right={<Btn onClick={() => void save()} disabled={saving || !config}>{saving ? "保存中…" : "保存配置"}</Btn>}
      />

      {!config ? (
        <Spinner text="加载积分配置…" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 flex flex-col gap-5">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[1rem] font-bold text-slate-800">总开关</h3>
                  <p className="text-[0.8rem] text-slate-400">关闭后签到、发帖、评论、获赞都不再产生积分</p>
                </div>
                <label className="inline-flex items-center gap-2 text-[0.85rem] text-slate-600">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  />
                  启用积分
                </label>
              </div>
            </Card>

            <Card>
              <h3 className="text-[1rem] font-bold text-slate-800 mb-4">签到积分</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="每日基础积分">
                  <Input value={String(config.signin_base)} onChange={setNum("signin_base")} inputMode="numeric" />
                </Field>
                <Field label="连续签到每天加成">
                  <Input value={String(config.signin_streak_bonus)} onChange={setNum("signin_streak_bonus")} inputMode="numeric" />
                </Field>
                <Field label="连续加成上限（天）">
                  <Input value={String(config.signin_streak_max)} onChange={setNum("signin_streak_max")} inputMode="numeric" />
                </Field>
              </div>
            </Card>

            <Card>
              <h3 className="text-[1rem] font-bold text-slate-800 mb-4">行为积分</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="发布帖子">
                  <Input value={String(config.post_points)} onChange={setNum("post_points")} inputMode="numeric" />
                </Field>
                <Field label="发帖每日上限">
                  <Input value={String(config.post_daily_limit)} onChange={setNum("post_daily_limit")} inputMode="numeric" />
                </Field>
                <Field label="发表评论">
                  <Input value={String(config.comment_points)} onChange={setNum("comment_points")} inputMode="numeric" />
                </Field>
                <Field label="评论每日上限">
                  <Input value={String(config.comment_daily_limit)} onChange={setNum("comment_daily_limit")} inputMode="numeric" />
                </Field>
                <Field label="帖子被赞（给作者）">
                  <Input value={String(config.like_points)} onChange={setNum("like_points")} inputMode="numeric" />
                </Field>
                <Field label="获赞每日上限">
                  <Input value={String(config.like_daily_limit)} onChange={setNum("like_daily_limit")} inputMode="numeric" />
                </Field>
              </div>
              <p className="mt-3 text-[0.78rem] text-slate-400">每日上限填 0 表示不限制；发帖与评论积分只发给内容作者。</p>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-[1rem] font-bold text-slate-800">游戏币兑换</h3>
                  <p className="text-[0.8rem] text-slate-400">需要商城经济系统已启用，并配置好发放指令</p>
                </div>
                <label className="inline-flex items-center gap-2 text-[0.85rem] text-slate-600">
                  <input
                    type="checkbox"
                    checked={config.exchange_enabled}
                    onChange={(e) => setConfig({ ...config, exchange_enabled: e.target.checked, enabled: e.target.checked ? true : config.enabled })}
                  />
                  允许兑换
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="多少积分换 1 游戏币">
                  <Input value={String(config.points_per_currency)} onChange={setNum("points_per_currency")} inputMode="numeric" />
                </Field>
                <Field label="单次最低使用积分">
                  <Input value={String(config.min_exchange)} onChange={setNum("min_exchange")} inputMode="numeric" />
                </Field>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <div className="text-[0.8rem] text-slate-500">全站积分总量</div>
              <div className="mt-1 text-[1.9rem] font-extrabold text-slate-800">{stats.total_points}</div>
            </Card>
            <Card>
              <div className="text-[0.8rem] text-slate-500">今日发放积分</div>
              <div className="mt-1 text-[1.9rem] font-extrabold text-emerald-600">{stats.today_issued}</div>
            </Card>
            <Card>
              <ErrorNote message={error} />
              <SuccessNote message={success} />
              <Btn className="w-full mt-2" onClick={() => void save()} disabled={saving}>
                {saving ? "保存中…" : "保存配置"}
              </Btn>
            </Card>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
