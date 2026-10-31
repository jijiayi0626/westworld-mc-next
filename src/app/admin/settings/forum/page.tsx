import { SettingsPage } from "../_components/shared";
import ForumTab from "../_components/ForumTab";

export default function Page() {
  return (
    <SettingsPage title="论坛与聊天" desc="论坛 Tab 显隐、聊天室开关、欢迎公告与发送限制" active="forum">
      <ForumTab />
    </SettingsPage>
  );
}
