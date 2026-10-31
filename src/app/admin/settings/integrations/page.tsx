import { SettingsPage } from "../_components/shared";
import IntegrationsTab from "../_components/IntegrationsTab";

export default function Page() {
  return (
    <SettingsPage title="三方集成" desc="微软 OAuth、UPOP 统一认证与 INU 星际通行证的凭据配置" active="integrations">
      <IntegrationsTab />
    </SettingsPage>
  );
}
