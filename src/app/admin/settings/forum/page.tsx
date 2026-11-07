import { SettingsPage } from "../_components/shared";
import ForumTab from "../_components/ForumTab";

export default function Page() {
  return (
    <SettingsPage title="社区与聊天" desc="社区开关、群聊创建权限、消息限制与群组管理" active="forum">
      <ForumTab />
    </SettingsPage>
  );
}
