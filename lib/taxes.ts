export interface TaxInputs {
  tradingProfit: number // Monthly
  rentalIncome: number // Monthly
  bondYields: number // Monthly
}

export interface TaxOutputs {
  tradingTax: number
  rentalTax: number
  bondTax: number
  totalTax: number
  netIncome: number
  effectiveTaxRate: number
}

export function calculatePolishTaxes(inputs: TaxInputs): TaxOutputs {
  // Belka Tax is 19% flat on capital gains and interest
  const tradingTax = Math.max(0, inputs.tradingProfit * 0.19)
  const bondTax = Math.max(0, inputs.bondYields * 0.19)
  
  // Rental Income Tax (Ryczałt) is 8.5% up to 100k PLN (~$25k USD/yr => ~$2083/mo), 12.5% above
  let rentalTax = 0
  if (inputs.rentalIncome <= 2083) {
    rentalTax = inputs.rentalIncome * 0.085
  } else {
    rentalTax = (2083 * 0.085) + ((inputs.rentalIncome - 2083) * 0.125)
  }

  const totalTax = tradingTax + bondTax + rentalTax
  const grossIncome = inputs.tradingProfit + inputs.rentalIncome + inputs.bondYields
  const netIncome = grossIncome - totalTax
  const effectiveTaxRate = grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0

  return {
    tradingTax,
    rentalTax,
    bondTax,
    totalTax,
    netIncome,
    effectiveTaxRate
  }
}
