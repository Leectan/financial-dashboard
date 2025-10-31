import { z } from 'zod'

export const FREDObservationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.string(),
})

export const FREDResponseSchema = z.object({
  observations: z.array(FREDObservationSchema).min(1),
})

export type FREDObservation = z.infer<typeof FREDObservationSchema>
export type FREDSeries = FREDObservation[]

export interface WilshireQuote {
  symbol: string
  price: number
  timestamp: number
  date: Date
}


