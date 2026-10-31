import { SettingsPage } from "../_components/shared";
import MailTab from "../_components/MailTab";

export default function Page() {
  return (
    <SettingsPage title="邮件服务" desc="接入 Resend 或 SMTP，用于找回密码验证码与批量通知投递" active="mail">
      <MailTab />
    </SettingsPage>
  );
}
