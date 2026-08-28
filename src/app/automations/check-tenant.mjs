import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const t = await db.tenant.create({
  data: { slug: 'testco', name: 'Test Co' },
})
const a = await db.agent.create({
  data: { tenantId: t.id, name: 'ghost', model: 'x' },
})
const r = await db.run.create({
  data: { tenantId: t.id, agentId: a.id, ref: 'r-SECRET1' },
})

console.log('SECRET REF:', r.ref)
console.log('TENANT ID :', t.id)

await db.$disconnect()
