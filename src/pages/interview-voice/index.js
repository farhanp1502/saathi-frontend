export const createMessage = ({ updated_at = Date.now(), source = "bot" || "user", msg = "", received = false, flowType = null }) => ({
  updated_at,
  source,
  msg,
  received,
  ...(flowType ? { flowType } : {}),
})
