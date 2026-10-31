import { SettingsPage } from "../_components/shared";
import PaymentTab from "../_components/PaymentTab";

export default function Page() {
  return (
    <SettingsPage title="支付配置" desc="接入易支付（Epay 通用协议），支持支付宝 / 微信 / QQ 钱包" active="payment">
      <PaymentTab />
    </SettingsPage>
  );
}
