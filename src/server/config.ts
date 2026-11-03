export function getMissingProductionConfig(env: Record<string, unknown> | undefined): string[] {
  if (env?.ENVIRONMENT !== 'production') return [];

  const required = [
    'MFA_ENCRYPTION_KEY',
    'META_APP_SECRET',
    'META_WEBHOOK_VERIFY_TOKEN',
    'META_WHATSAPP_TOKEN',
    'META_PHONE_NUMBER_ID',
    'ALLOWED_ORIGINS'
  ];

  return required.filter((name) => {
    const value = env?.[name];
    return typeof value !== 'string' || value.trim() === '';
  });
}
