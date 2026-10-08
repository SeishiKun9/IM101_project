export async function logAdminAudit(
  client,
  userId,
  action,
  tableName,
  recordId,
  oldData,
  newData,
) {
  await client.query(
    `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data, action_time)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [
      userId || null,
      action,
      tableName,
      recordId,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
    ],
  );
}
