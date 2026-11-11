"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Badge, Btn, Empty, ErrorNote, Field, Input, SuccessNote } from "@/components/ui";
import { SettingsGroup, SettingsStack, SettingRow, type PayConfigView } from "./shared";

export default function PaymentTab() {
  const [payCfg, setPayCfg] = useState<PayConfigView | null>(null);
  const [payForm, setPayForm] = useState({
    enabled: false,
    api_url: "",
    pid: "",
    key: "",
    sitename: "",
    types: ["alipay", "wxpay", "qqpay"],
  });
  const [payBusy, setPayBusy] = useState(false);
  const [payTest, setPayTest] = useState<{ err: string; ok: string }>({ err: "", ok: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const pay = await api<PayConfigView>("/admin/pay-config");
      setPayCfg(pay);
      setPayForm((prev) => ({
        ...prev,
        enabled: pay.enabled,
        api_url: pay.api_url,
        pid: pay.pid,
        sitename: pay.sitename,
        types: pay.types.length > 0 ? pay.types : pay.types_available.map((t) => t.key),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savePay = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setPayTest({ err: "", ok: "" });
    setPayBusy(true);
    try {
      const saved = await api<PayConfigView>("/admin/pay-config", {
        method: "POST",
        body: JSON.stringify({
          enabled: payForm.enabled,
          api_url: payForm.api_url.trim(),
          pid: payForm.pid.trim(),
          key: payForm.key.trim(),
          sitename: payForm.sitename.trim(),
          types: payForm.types,
        }),
      });
      setPayCfg(saved);
      setPayForm((p) => ({ ...p, key: "" }));
      setSuccess("支付配置已保存");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "支付配置保存失败");
    } finally {
      setPayBusy(false);
    }
  };

  const testPay = async () => {
    setPayTest({ err: "", ok: "" });
    setPayBusy(true);
    try {
      const r = await api<{ reachable: boolean; status: number }>("/admin/pay-config/test", { method: "POST" });
      setPayTest({ err: "", ok: `接口可达（HTTP ${r.status}），可以正常发起支付` });
    } catch (err) {
      setPayTest({ err: err instanceof Error ? err.message : "连通性测试失败", ok: "" });
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <>
      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <SettingsStack>
        <SettingsGroup
          title="易支付（Epay）"
          desc="兼容主流易支付服务商的通用协议。用户在商城下单后可直接跳转支付宝 / 微信 / QQ 钱包收银台，支付成功由服务端异步通知自动更新订单状态。"
          aside={
            payCfg ? (
              <Badge color="gray">
                {payCfg.configured ? "已配置可用" : payCfg.enabled ? "已启用（配置不完整）" : "未启用"}
              </Badge>
            ) : undefined
          }
        >
        {payCfg === null ? (
          <Empty text="加载中..." />
        ) : (
          <form onSubmit={savePay} className="settings-form">
            <SettingRow label="启用在线支付" hint="关闭后商城仅保留手动下单">
              <input
                type="checkbox"
                checked={payForm.enabled}
                onChange={(e) => setPayForm((p) => ({ ...p, enabled: e.target.checked }))}
                className="w-4 h-4 accent-slate-900"
              />
            </SettingRow>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="接口地址" hint="易支付站点根地址，如 https://pay.example.com（不要带 submit.php）">
                <Input
                  value={payForm.api_url}
                  onChange={(e) => setPayForm((p) => ({ ...p, api_url: e.target.value }))}
                  placeholder="https://pay.example.com"
                />
              </Field>
              <Field label="商户 PID" hint="易支付后台的商户 ID">
                <Input
                  value={payForm.pid}
                  onChange={(e) => setPayForm((p) => ({ ...p, pid: e.target.value }))}
                  placeholder="1001"
                />
              </Field>
              <Field label="商户密钥" hint={payCfg.key_set ? "已保存，留空保留原值" : "用于 MD5 签名校验，务必与服务端一致"}>
                <Input
                  type="password"
                  value={payForm.key}
                  onChange={(e) => setPayForm((p) => ({ ...p, key: e.target.value }))}
                  placeholder={payCfg.key_set ? "••••••（留空保留）" : "商户密钥"}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="站点名称" hint="显示在收银台">
                <Input
                  value={payForm.sitename}
                  onChange={(e) => setPayForm((p) => ({ ...p, sitename: e.target.value }))}
                  placeholder="Westworld西域之光"
                  maxLength={60}
                />
              </Field>
            </div>

            <Field label="启用的支付方式" hint="至少选择一种">
              <div className="flex flex-wrap gap-4 pt-1">
                {payCfg.types_available.map((t) => (
                  <label key={t.key} className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={payForm.types.includes(t.key)}
                      onChange={(e) =>
                        setPayForm((p) => ({
                          ...p,
                          types: e.target.checked ? [...p.types, t.key] : p.types.filter((x) => x !== t.key),
                        }))
                      }
                      className="w-4 h-4 accent-slate-900"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </Field>

            <div className="settings-note">
              <div className="font-semibold text-slate-700 mb-1">回调地址（无需手动填写，已自动生成）</div>
              <div className="font-mono text-[0.75rem] break-all text-slate-700">{payCfg.notify_url}</div>
              <div className="font-mono text-[0.75rem] break-all text-slate-700 mt-1">{payCfg.return_url}</div>
              <p className="mt-2 text-slate-500">
                若服务商要求单独填写通知地址，请填写上面的 notify 地址；接口地址只填根域名。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Btn type="submit" disabled={payBusy}>{payBusy ? "保存中..." : "保存支付配置"}</Btn>
              <Btn type="button" variant="ghost" onClick={() => void testPay()} disabled={payBusy}>
                测试接口连通性
              </Btn>
            </div>
            {payTest.err && <div className="settings-error break-all">{payTest.err}</div>}
            {payTest.ok && <div className="settings-error">{payTest.ok}</div>}
          </form>
        )}
        </SettingsGroup>
      </SettingsStack>
    </>
  );
}
