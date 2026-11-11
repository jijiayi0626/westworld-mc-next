"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Btn, Empty, ErrorNote, Field, Input, SuccessNote } from "@/components/ui";
import { SettingsGroup, SettingsStack, type Setting } from "./shared";

export default function BasicTab() {
  const [list, setList] = useState<Setting[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  // 网站图标
  const [favicon, setFavicon] = useState("");
  const [faviconBusy, setFaviconBusy] = useState(false);
  const faviconFileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api<Setting[]>("/admin/settings");
      setList(next);
      setFavicon(next.find((s) => s.key === "site_favicon")?.value || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () => {
    setEditingKey(null);
    setKey("");
    setValue("");
  };

  const startEdit = (s: Setting) => {
    setEditingKey(s.key);
    setKey(s.key);
    setValue(s.value);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await api("/admin/settings", { method: "POST", body: JSON.stringify({ key: key.trim(), value }) });
      setSuccess(`已保存 ${key}`);
      startNew();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveFavicon = async (urlOverride?: string) => {
    const url = (urlOverride ?? favicon).trim();
    setError("");
    setSuccess("");
    setFaviconBusy(true);
    try {
      const saved = await api<{ url: string }>("/content/admin/favicon", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      setFavicon(saved.url);
      setSuccess(saved.url ? "网站图标已保存，刷新页面后生效" : "已清除自定义网站图标");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setFaviconBusy(false);
    }
  };

  const uploadFavicon = async (file: File) => {
    setError("");
    setSuccess("");
    if (!file.type.startsWith("image/")) {
      setError("请选择 PNG / JPG / WEBP / GIF 图片");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("图标建议小于 1MB");
      return;
    }
    setFaviconBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ url: string }>("/upload/image", { method: "POST", body: fd });
      setFavicon(res.url);
      setSuccess("图标已上传，请点击保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setFaviconBusy(false);
      if (faviconFileRef.current) faviconFileRef.current.value = "";
    }
  };

  const filteredList = (list ?? []).filter(
    (s) => !keyword || `${s.key} ${s.value}`.toLowerCase().includes(keyword.toLowerCase()),
  );

  return (
    <>
      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <SettingsStack>
        <SettingsGroup
          title="网站图标"
          desc="浏览器标签页与收藏夹图标。建议使用 64×64 或 128×128 的方形 PNG；留空则使用默认图标。"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-slate-200 bg-slate-50">
              {favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={favicon} alt="网站图标预览" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[0.7rem] text-slate-500">默认</span>
              )}
            </div>
            <div className="min-w-[220px] flex-1">
              <Input
                value={favicon}
                onChange={(e) => setFavicon(e.target.value)}
                placeholder="https://... 或上传后自动填充"
                maxLength={500}
              />
            </div>
            <input
              ref={faviconFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFavicon(file);
              }}
            />
            <Btn type="button" variant="ghost" disabled={faviconBusy} onClick={() => faviconFileRef.current?.click()}>
              {faviconBusy ? "处理中..." : "上传图标"}
            </Btn>
            <Btn type="button" disabled={faviconBusy} onClick={() => void saveFavicon()}>
              保存图标
            </Btn>
            {favicon && (
              <Btn
                type="button"
                variant="ghost"
                disabled={faviconBusy}
                onClick={() => {
                  setFavicon("");
                  void saveFavicon("");
                }}
              >
                恢复默认
              </Btn>
            )}
          </div>
        </SettingsGroup>

        <SettingsGroup
          title={editingKey ? `编辑设置 ${editingKey}` : "新增 / 编辑设置"}
          desc="站点键值配置，保存后即时生效。"
        >
          <form onSubmit={save} className="settings-form">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Key" hint="不能以 reset_code: 开头">
                <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="如 site_title / maintenance" maxLength={100} required />
              </Field>
              <Field label="Value">
                <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="值" maxLength={10000} />
              </Field>
            </div>
            <div className="flex gap-2">
              <Btn type="submit" disabled={busy}>{busy ? "保存中..." : "保存"}</Btn>
              {editingKey && <Btn type="button" variant="ghost" onClick={startNew}>取消编辑</Btn>}
            </div>
          </form>
        </SettingsGroup>

        <SettingsGroup
          title="现有设置"
          aside={
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索 Key / 值..."
              className="w-full sm:w-[260px] bg-slate-50 border border-slate-200 rounded-[12px] px-4 py-2 text-[0.88rem] text-slate-800 focus:outline-none focus:border-slate-400 placeholder:text-slate-500"
            />
          }
        >
          {list === null ? (
            <Empty text="加载中..." />
          ) : filteredList.length === 0 ? (
            <Empty text={list.length === 0 ? "暂无设置" : "没有匹配的设置"} />
          ) : (
            <div className="flex flex-col">
              {filteredList.map((s) => (
                <div key={s.key} className="settings-row">
                  <div className="settings-row__label">
                    <div className="font-mono text-[0.85rem] text-emerald-700 break-all">{s.key}</div>
                    <div className="mt-1 text-[0.85rem] text-slate-600 break-all">{s.value}</div>
                  </div>
                  <div className="settings-row__control">
                    <Btn size="sm" variant="ghost" onClick={() => startEdit(s)}>编辑</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SettingsGroup>

        <SettingsGroup title="高级设置" desc="可信反代 / CDN 出口段、图标与横幅等">
          <div className="settings-note flex flex-col gap-2">
            <p>网站标题、描述、服务器 IP、LOGO、ICO 图标等站点信息在「内容管理」中编辑。</p>
            <p>站点键值配置可在「基础配置」中新增 / 编辑（如维护模式、功能开关），不能以 <code className="font-mono bg-slate-100 px-1 rounded-[8px]">reset_code:</code> 开头。</p>
            <p>若站点部署在反向代理 / CDN 之后，相关出口 IP 段需在部署层（Cloudflare / Nginx）配置，本站不额外存储。</p>
          </div>
        </SettingsGroup>
      </SettingsStack>
    </>
  );
}
