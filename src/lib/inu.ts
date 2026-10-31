/** INU OAuth 回调只传错误码，前端统一映射为可读文案，避免泄露内部信息 */
export function inuErrorText(code: string): string {
  switch (code) {
    case "cancelled":
      return "已取消 INU 登录";
    case "email_exists":
      return "该邮箱已注册本地账号，请先用原账号登录，再到安全中心绑定 INU";
    case "banned":
      return "该账号已被封禁";
    case "conflict":
      return "该 INU 账号已绑定其他本地账号";
    case "state":
      return "INU 登录校验失败，请重试";
    case "rate":
      return "操作过于频繁，请稍后再试";
    case "config":
      return "INU 登录暂未配置，请联系管理员";
    default:
      return "INU 登录暂时不可用，请稍后再试";
  }
}
