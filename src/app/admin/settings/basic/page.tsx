import { SettingsPage } from "../_components/shared";
import BasicTab from "../_components/BasicTab";

export default function Page() {
  return (
    <SettingsPage title="基础配置" desc="站点键值配置的新增与编辑（维护模式、功能开关等）" active="basic">
      <BasicTab />
    </SettingsPage>
  );
}
