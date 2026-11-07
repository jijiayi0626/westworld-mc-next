"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Btn, Card, Empty, ErrorNote, Field, Input, Select, SuccessNote } from "@/components/ui";

interface ChatConfig {
  enabled: boolean;
  welcome: string;
  max_text: number;
  max_image_mb: number;
  group_create: "all" | "admin";
  show_announcements: boolean;
  show_chat: boolean;
}

interface AdminRoom {
  id: number;
  kind: string;
  name: string;
  avatar: string;
  notice: string;
  owner_name: string | null;
  member_count: number;
  message_count: number;
  created_at: string;
}

const KIND_LABEL: Record<string, string> = {
  community: "社区群",
  group: "群聊",
  dm: "私信",
};

export default function ForumTab() {
  const [chatCfg, setChatCfg] = useState<ChatConfig | null>(null);
  const [chatForm, setChatForm] = useState<ChatConfig>({
    enabled: true,
    welcome: "",
    max_text: 400,
    max_image_mb: 4,
    group_create: "all",
    show_announcements: true,
    show_chat: true,
  });
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [rooms, setRooms] = useState<AdminRoom[] | null>(null);
  const [roomBusy, setRoomBusy] = useState(0);

  const load = useCallback(async () => {
    try {
      const chat = await api<ChatConfig>("/admin/chat-config");
      setChatCfg(chat);
      setChatForm({
        enabled: chat.enabled,
        welcome: chat.welcome,
        max_text: chat.max_text,
        max_image_mb: chat.max_image_mb,
        group_create: chat.group_create === "admin" ? "admin" : "all",
        show_announcements: chat.show_announcements !== false,
        show_chat: chat.show_chat !== false,
      });
      const roomData = await api<{ rooms: AdminRoom[] }>("/chat/admin/rooms");
      setRooms(roomData.rooms);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setRooms([]);
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
      setSuccess("社区配置已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "社区配置保存失败");
    } finally {
      setChatBusy(false);
    }
  };

  const deleteRoom = async (room: AdminRoom) => {
    if (!window.confirm(`确定删除「${room.name || KIND_LABEL[room.kind] || "会话"}」吗？消息记录将一并清除。`)) {
      return;
    }
    setRoomBusy(room.id);
    setError("");
    setSuccess("");
    try {
      await api(`/chat/admin/rooms/${room.id}/delete`, { method: "POST" });
      setSuccess("会话已删除");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setRoomBusy(0);
    }
  };

  return (
    <>
      <ErrorNote message={error} />
      <SuccessNote message={success} />

      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[1.05rem] font-bold text-slate-800">社区与聊天室</h3>
          {chatCfg && <Badge color={chatCfg.enabled ? "green" : "gray"}>{chatCfg.enabled ? "已启用" : "已关闭"}</Badge>}
        </div>
        <p className="text-[0.82rem] text-slate-500 mb-4">
          控制社区群、群聊与私信的整体开关、发送限制，以及普通玩家能否自行创建群聊，保存后即时生效。
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
                启用社区消息（关闭后用户只能浏览动态）
              </label>
              <label className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chatForm.show_announcements}
                  onChange={(e) => setChatForm((p) => ({ ...p, show_announcements: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-500"
                />
                显示公告
              </label>
              <label className="flex items-center gap-2 text-[0.88rem] text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chatForm.show_chat}
                  onChange={(e) => setChatForm((p) => ({ ...p, show_chat: e.target.checked }))}
                  className="w-4 h-4 accent-emerald-500"
                />
                显示社区消息
              </label>
            </div>

            <Field label="社区群公告" hint="显示在社区群消息区顶部，留空不显示，最长 200 字">
              <Input
                value={chatForm.welcome}
                onChange={(e) => setChatForm((p) => ({ ...p, welcome: e.target.value }))}
                maxLength={200}
                placeholder="如：欢迎来到西域社区！文明发言，禁止刷屏与广告。"
              />
            </Field>

            <Field label="谁可以创建群聊" hint="选择「仅管理员」后，普通玩家只能加入已有群聊">
              <Select
                value={chatForm.group_create}
                onChange={(e) =>
                  setChatForm((p) => ({ ...p, group_create: e.target.value === "admin" ? "admin" : "all" }))
                }
              >
                <option value="all">所有注册玩家</option>
                <option value="admin">仅管理员</option>
              </Select>
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

      <Card className="mt-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[1.05rem] font-bold text-slate-800">群聊管理</h3>
          <Badge color="blue">{rooms ? `${rooms.filter((r) => r.kind === "group").length} 个群聊` : "…"}</Badge>
        </div>
        <p className="text-[0.82rem] text-slate-500 mb-4">
          查看全部会话（包含社区群与私信），可删除违规群聊；社区群固定保留，不可删除。
        </p>
        {rooms === null ? (
          <Empty text="加载中..." />
        ) : rooms.length === 0 ? (
          <Empty text="暂无会话" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[0.85rem]">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400">
                  <th className="py-2 pr-3 font-medium">名称</th>
                  <th className="py-2 pr-3 font-medium">类型</th>
                  <th className="py-2 pr-3 font-medium">成员</th>
                  <th className="py-2 pr-3 font-medium">消息</th>
                  <th className="py-2 pr-3 font-medium">群主</th>
                  <th className="py-2 pr-3 font-medium">创建时间</th>
                  <th className="py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[0.7rem] font-bold text-slate-500">
                          {(room.name || KIND_LABEL[room.kind] || "会").slice(0, 1)}
                        </span>
                        <span className="max-w-[180px] truncate font-medium text-slate-700">
                          {room.name || `${KIND_LABEL[room.kind] || "会话"} #${room.id}`}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge color={room.kind === "community" ? "green" : room.kind === "dm" ? "gray" : "blue"}>
                        {KIND_LABEL[room.kind] || room.kind}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-500">{room.member_count}</td>
                    <td className="py-2.5 pr-3 text-slate-500">{room.message_count}</td>
                    <td className="py-2.5 pr-3 text-slate-500">{room.owner_name || "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-400">{room.created_at}</td>
                    <td className="py-2.5 text-right">
                      {room.kind === "community" ? (
                        <span className="text-[0.78rem] text-slate-300">固定保留</span>
                      ) : (
                        <Btn
                          variant="danger"
                          size="sm"
                          disabled={roomBusy === room.id}
                          onClick={() => void deleteRoom(room)}
                        >
                          {roomBusy === room.id ? "删除中" : "删除"}
                        </Btn>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
