import { SettingsPage } from "../_components/shared";
import AppearanceTab from "../_components/AppearanceTab";

export default function Page() {
  return (
    <SettingsPage title="外观模板" desc="切换前台页面模板，保存后前台即时生效，无需重新部署" active="appearance">
      <AppearanceTab />
    </SettingsPage>
  );
}
