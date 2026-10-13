import nodemailer from 'nodemailer'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = String(body?.email || '').trim().toLowerCase()
  const eventName = String(body?.eventName || '').trim()
  const inviteUrl = String(body?.inviteUrl || '').trim()
  const hostName = String(body?.hostName || '').trim()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address.', data: { message: 'Enter a valid email address.' } })
  }
  if (!eventName || eventName.length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'Missing event name.', data: { message: 'Missing event name.' } })
  }

  let url: URL
  try {
    url = new URL(inviteUrl)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Missing invite link.', data: { message: 'Missing invite link.' } })
  }
  if (!url.pathname.startsWith('/join/')) {
    throw createError({ statusCode: 400, statusMessage: 'Invite link is not valid.', data: { message: 'Invite link is not valid.' } })
  }

  const config = useRuntimeConfig()
  if (!config.smtpHost || !config.mailFrom) {
    const message = 'Email is not configured. Add the SMTP settings to .env and restart the dev server.'
    throw createError({ statusCode: 500, statusMessage: message, data: { message } })
  }

  const port = Number(config.smtpPort) || 587
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port,
    secure: port === 465,
    auth: config.smtpUser
      ? { user: config.smtpUser, pass: config.smtpPass }
      : undefined,
  })

  const who = hostName || 'Someone'
  await transporter.sendMail({
    from: config.mailFrom,
    to: email,
    subject: `You’re invited to ${eventName}`,
    text: `${who} invited you to ${eventName}.\n\nOpen the gathering:\n${inviteUrl}\n`,
  })

  return { sent: true }
})
