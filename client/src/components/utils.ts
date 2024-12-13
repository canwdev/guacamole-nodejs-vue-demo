/**
 * 使用AES-CBC加密数据并返回base64编码的字符串
 * @param value 要加密的数据
 * @param secretKey 加密密钥
 * @returns Promise<string> 返回base64编码的加密数据
 */
export async function encryptToken<T>(value: T, secretKey: string): Promise<string> {
  // 生成随机IV
  const iv = crypto.getRandomValues(new Uint8Array(16));

  // 导入密钥
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "AES-CBC" },
    false,
    ["encrypt"]
  );

  // 加密数据
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-CBC",
      iv: iv
    },
    keyMaterial,
    new TextEncoder().encode(JSON.stringify(value))
  );

  // 构建结果对象
  const data = {
    iv: btoa(String.fromCharCode(...iv)),
    value: btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  };

  // 返回base64编码的结果
  return btoa(JSON.stringify(data));
}
