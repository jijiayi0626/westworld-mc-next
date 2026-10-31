"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, Field, Input, SuccessNote } from "@/components/ui";

interface ChatConfig {
  enabled: boolean;
  welcome: string;
  max_text: number;
  max_image_mb: number;
  show_announcements: boolean;
  show_chat: boolean;
}

export default function ForumTab() {
  const [chatCfg, setChatCfg] = useState<ChatConfig | null>(null);
  const [chatForm, setChatForm] = useState<ChatConfig>({
    enabled: true,
    welcome: "",
    max_text: 400,
    max_image_mb: 4,
    show_announcements: true,
    show_chat: true,
  });
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const chat = await api<ChatConfig>("/admin/chat-config");
      setChatCfg(chat);
      setChatForm({
        enabled: chat.enabled,
        welcome: chat.welcome,
        max_text: chat.max_text,
        max_image_mb: chat.max_image_mb,
        show_announcements: chat.show_announcements !== false,
        show_chat: chat.show_chat !== false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveChat = async () => {
    setError("");
    setSuccess("");
    setChatBusy(true);
    try {
      const saved = await api<ChatConfig>("/admin/chat-config", {
        method: "POST",
        body: JSON.stringify(chatForm),
      });
      setChatCfg(saved);
      setSuccess("聊天室配置已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "聊天室配置保存失败");
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <>
      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[1.05rem] font-bold text-slate-800">论坛与聊天室</h3>
          {chatCfg && <Badge color={chatCfg.enabled ? "green" : "gray"}>{chatCfg.enabled ? "已启用" : "已关闭"}</Badge>}
        </div>
        <p className="text-[0.82rem] text-slate-500 mb-4">
          用户中心「论坛」包含公告与聊天两个 Tab；此处控制整体开关、Tab 显隐与发送限制，保存后即时生效。
        </p>
        {chatCfg === null ? (
          <Empty text="加载中..." />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveChat();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chatForm.enabled}
                  onChange={(e) => setChatForm((p) => ({ ...p, enabled: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-500"
                />
                启用聊天室（关闭后用户只能浏览）
              </label>
              <label className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chatForm.show_announcements}
                  onChange={(e) => setChatForm((p) => ({ ...p, show_announcements: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-500"
                />
                显示「公告」Tab
              </label>
              <label className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chatForm.show_chat}
                  onChange={(e) => setChatForm((p) => ({ ...p, show_chat: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-500"
                />
                显示「聊天」Tab
              </label>
            </div>
            <Field label="欢迎公告" hint="显示在聊天消息区顶部，留空不显示，最长 200 字">
              <Input
                value={chatForm.welcome}
                onChange={(e) => setChatForm((p) => ({ ...p, welcome: e.target.value }))}
                maxLength={200}
                placeholder="如：欢迎来到聊天室！文明发言，禁止刷屏与广告。"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="单条消息字数上限" hint="20 - 1000 字">
                <Input
                  type="number"
                  min={20}
                  max={1000}
                  value={chatForm.max_text}
                  onChange={(e) => setChatForm((p) => ({ ...p, max_text: Number(e.target.value) || 400 }))}
                />
              </Field>
              <Field label="单张图片大小上限（MB）" hint="1 - 8 MB">
                <Input
                  type="number"
                  min={1}
                  max={8}
                  value={chatForm.max_image_mb}
                  onChange={(e) => setChatForm((p) => ({ ...p, max_image_mb: Number(e.target.value) || 4 }))}
                />
              </Field>
            </div>
            <div>
              <Btn type="submit" disabled={chatBusy}>{chatBusy ? "保存中..." : "保存设置"}</Btn>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
