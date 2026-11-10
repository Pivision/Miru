/**
 * 密码相关的表单规则：两次输入是否一致。
 *
 * 注册页与设置页的改密码表单各自判过一遍同一条规则，文案还漂成了
 * 「两次输入的密码不一样」与「两次输入的新密码不一样」两种说法 —— 同一个错误
 * 在同一个站点里给出两种措辞，用户会以为碰到了两回事。规则与文案都收在这里。
 */

/** 两次输入不一致时的统一文案。 */
export const PASSWORD_MISMATCH = '两次输入的密码不一样';

/** 校验两次密码输入，通过时返回 null。 */
export function passwordConfirmError(password: string, confirm: string): string | null {
  return password === confirm ? null : PASSWORD_MISMATCH;
}
