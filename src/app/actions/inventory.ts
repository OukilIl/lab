'use server'

import prisma from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function addProduct(formData: FormData) {
  const gtin = formData.get('gtin') as string
  const name = formData.get('name') as string
  const targetStock = parseInt(formData.get('targetStock') as string) || 100
  const lowStockThresholdPct = parseInt(formData.get('lowStockThresholdPct') as string) || 20
  const expirationWarningDays = parseInt(formData.get('expirationWarningDays') as string) || 30

  if (!gtin || !name) return { error: 'Missing GTIN or Name' }

  try {
    await prisma.product.create({
      data: {
        gtin,
        name,
        targetStock,
        lowStockThresholdPct,
        expirationWarningDays
      }
    })
    revalidatePath('/products')
    return { success: true }
  } catch (e: any) {
    if (e.code === 'P2002') return { error: 'Product with this GTIN already exists.' }
    return { error: 'Failed to add product.' }
  }
}

export async function addInventoryBatch(formData: FormData) {
  // Parses a scan or manual entry
  const gtin = formData.get('gtin') as string
  const batchNumber = formData.get('batchNumber') as string
  const expirationDateStr = formData.get('expirationDate') as string
  const initialQuantity = parseInt(formData.get('initialQuantity') as string) || 1
  const producer = formData.get('producer') as string
  const notes = formData.get('notes') as string

  if (!gtin || !batchNumber || !expirationDateStr) return { error: 'Missing required standard info' }

  // Check if product exists, if not we need the user to define it first.
  const product = await prisma.product.findUnique({ where: { gtin } })
  if (!product) {
    return { 
      error: 'Product not found. Please add the GTIN to your Products list first.',
      code: 'NOT_FOUND',
      gtin 
    }
  }

  const expirationDate = new Date(expirationDateStr)

  try {
    const existingBatch = await prisma.inventoryBatch.findUnique({
      where: { gtin_batchNumber: { gtin, batchNumber } }
    })

    if (existingBatch) {
      // Just add quantity
      await prisma.inventoryBatch.update({
        where: { id: existingBatch.id },
        data: {
          currentQuantity: existingBatch.currentQuantity + initialQuantity,
          initialQuantity: existingBatch.initialQuantity + initialQuantity,
        }
      })
    } else {
      await prisma.inventoryBatch.create({
        data: {
           gtin,
           batchNumber,
           expirationDate,
           initialQuantity,
           currentQuantity: initialQuantity,
           producer,
           notes
        }
      })
    }
    revalidatePath('/')
    revalidatePath('/products')
    return { success: true }
  } catch (e) {
    return { error: 'Failed to add batch.' }
  }
}

export async function logUsage(formData: FormData) {
  const session = await getSession()
  if (!session) return { error: 'Not authenticated' }

  const inventoryBatchId = formData.get('inventoryBatchId') as string
  const quantityUsed = parseInt(formData.get('quantityUsed') as string) || 0

  if (!inventoryBatchId || quantityUsed <= 0) return { error: 'Invalid data' }

  try {
    const batch = await prisma.inventoryBatch.findUnique({ where: { id: inventoryBatchId }})
    if (!batch) return { error: 'Batch not found' }
    if (batch.currentQuantity < quantityUsed) return { error: 'Not enough items in stock for this batch' }

    await prisma.$transaction([
      prisma.inventoryBatch.update({
        where: { id: inventoryBatchId },
        data: { currentQuantity: batch.currentQuantity - quantityUsed }
      }),
      prisma.usageLog.create({
        data: {
          userId: session.id,
          inventoryBatchId: batch.id,
          quantityUsed
        }
      })
    ])

    revalidatePath('/')
    revalidatePath('/products')
    return { success: true }
  } catch (e) {
    return { error: 'Failed to log usage' }
  }
}
