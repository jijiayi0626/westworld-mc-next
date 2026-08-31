"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserShell } from "@/components/Shell";
import { api } from "@/lib/api";
import { Btn, Card, ErrorNote, Field, Input, PageHeader, Select, SuccessNote, TextArea, Empty, StatusBadge, fmtTime } from "@/components/ui";

interface Application {
  id: number;
  mc_name: string;
  type: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  review_note: string;
  reviewer: string | null;
}

export default function ApplicationPage() {
  const [list, setList] = useState<Application[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [mcName, setMcName] = useState("");
  const [type, setType] = useState("java");
  const [intro, setIntro] = useState("");
  const [channel, setChannel] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api<Application[]>("/application/mine"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/application/submit", {
        method: "POST",
        body: JSON.stringify({ mc_name: mcName.trim(), type, intro: intro.trim(), channel: channel.trim() }),
      });
      setSuccess("申请已提交，请等待管理员审核");
      setMcName("");
      setIntro("");
      setChannel("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setBusy(false);
    }
  };

  const hasPending = list?.some((a) => a.status === "pending");

  return (
    <UserShell>
      <PageHeader title="入服申请" desc="申请白名单，通过审核后即可进入服务器" />

      {!hasPending && (
        <Card className="mb-5">
          <h3 className="text-[1.05rem] font-bold text-white mb-4">新申请</h3>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="游戏名" hint="3-16 位字母/数字/下划线，与游戏内一致">
                <Input value={mcName} onChange={(e) => setMcName(e.target.value)} placeholder="如 Steve_01" maxLength={16} required />
              </Field>
              <Field label="客户端">
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="java">Java 版</option>
                  <option value="bedrock">基岩版</option>
                </Select>
              </Field>
            </div>
            <Field label="自我介绍" hint="简单介绍自己，如游玩经历、为何想加入等">
              <TextArea value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="介绍一下自己吧~" maxLength={2000} required />
            </Field>
            <Field label="从哪里了解到本服" hint="选填">
              <Input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="如：朋友推荐 / QQ 群 / 服务器列表" maxLength={50} />
            </Field>
            <ErrorNote message={error} />
            <SuccessNote message={success} />
            <div>
              <Btn type="submit" disabled={busy}>{busy ? "提交中..." : "提交申请"}</Btn>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <h3 className="text-[1.05rem] font-bold text-white mb-4">我的申请记录</h3>
        {list === null ? (
          <Empty text="加载中..." />
        ) : list.length === 0 ? (
          <Empty text="还没有提交过申请" />
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {list.map((a) => (
              <div key={a.id} className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-white font-semibold">{a.mc_name}</span>
                    <StatusBadge status={a.status} />
                    <span className="text-[0.78rem] text-slate-500">{a.type === "bedrock" ? "基岩版" : "Java"}</span>
                  </div>
                  <span className="text-[0.78rem] text-slate-500">{fmtTime(a.created_at)}</span>
                </div>
                {a.status === "rejected" && a.review_note && (
                  <div className="mt-2 px-3 py-2 text-[0.82rem] text-red-300 bg-red-500/10 border border-red-500/20 rounded-[8px]">
                    拒绝原因：{a.review_note}
                  </div>
                )}
                {a.status === "approved" && (
                  <div className="mt-2 px-3 py-2 text-[0.82rem] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-[8px]">
                    恭喜！已通过审核（{a.reviewer || "管理员"} · {fmtTime(a.reviewed_at)}）。现在可以加入服务器了：sdcmc.chipzz.top:23400
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </UserShell>
  );
}