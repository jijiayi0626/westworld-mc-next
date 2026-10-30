// 验证 OAuth state token 的 TTL 必须为 10 分钟（而非默认 7 天）
// 防止 state 泄露后被长期滥用绑定他人外部账号
import assert from "node:assert";
import { signToken, verifyToken } from "../src/worker/lib/jwt.ts";

const SECRET = "test-secret-at-least-16-chars";
const TEN_MINUTES_SEC = 10 * 60;
const SEVEN_DAYS_SEC = 7 * 24 * 3600;

async function main() {
  // 模拟 microsoft.ts / upop.ts 中的 OAuth state token 创建
  const state = await signToken(
    { sub: "1", username: "alice", role: "oauth" },
    SECRET,
    10 / 60, // 10 分钟 TTL（修复后的值）
  );

  // 1. state 立即可验证通过
  const payload = await verifyToken(state, SECRET);
  assert.ok(payload, "state token 应在创建后立即可验证");
  assert.strictEqual(payload!.role, "oauth");
  assert.strictEqual(payload!.sub, "1");

  // 2. 验证 exp 距离 iat 约为 10 分钟（而非 7 天）
  const ttl = payload!.exp - payload!.iat;
  assert.ok(
    ttl >= TEN_MINUTES_SEC - 2 && ttl <= TEN_MINUTES_SEC + 2,
    `state token TTL 应为 10 分钟（${TEN_MINUTES_SEC}s），实际为 ${ttl}s`,
  );
  assert.ok(
    ttl < SEVEN_DAYS_SEC / 2,
    `state token TTL 不应接近 7 天（${SEVEN_DAYS_SEC}s），实际为 ${ttl}s`,
  );

  // 3. 对比：默认 TTL 仍为 7 天（不影响登录/重置等其他场景）
  const defaultToken = await signToken(
    { sub: "1", username: "alice", role: "user" },
    SECRET,
  );
  const defaultPayload = await verifyToken(defaultToken, SECRET);
  const defaultTtl = defaultPayload!.exp - defaultPayload!.iat;
  assert.ok(
    defaultTtl >= SEVEN_DAYS_SEC - 2 && defaultTtl <= SEVEN_DAYS_SEC + 2,
    `默认 TTL 应为 7 天（${SEVEN_DAYS_SEC}s），实际为 ${defaultTtl}s`,
  );

  // 4. 10 分钟后 state 应失效（模拟时间流逝）
  // 通过伪造一个已过期的 state 来验证 verifyToken 会拒绝
  const expiredState = await signToken(
    { sub: "1", username: "alice", role: "oauth" },
    SECRET,
    -1 / 3600, // 负 TTL = 已过期
  );
  const expiredPayload = await verifyToken(expiredState, SECRET);
  assert.strictEqual(expiredPayload, null, "过期的 state token 应被拒绝");

  console.log("✓ OAuth state token TTL 测试通过：10 分钟过期，非 7 天");
}

main().catch((e) => {
  console.error("✗ 测试失败:", e.message);
  process.exit(1);
});
