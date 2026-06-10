export const DEFAULT_CONFIG = {
  taxRate: 0.12,
  rentAmount: 30,
  interestRate: 0.02,       // savings interest per pay period
  loanInterestRate: 0.05,   // loan interest per pay period — must always be >= interestRate
  autoSavePercent: 0.20,
  philanthropyPercent: 0.03,
  payPeriod: 'weekly',      // 'weekly' | 'monthly'
  paydayDow: 6,             // weekly payday: 0=Sun 1=Mon … 6=Sat (default Saturday)
  paydayDom: 28,            // monthly payday: 1–28 (clamped to last day of month)
  autoSettle: false,        // auto-run + settle payslips on payday when parent opens app
  currency: 'INR',
  utilityChargeDefault: 5,
}

export const CURRENCIES = {
  INR: { symbol: '₹',   name: 'Indian Rupee',      code: 'INR' },
  USD: { symbol: '$',   name: 'US Dollar',          code: 'USD' },
  EUR: { symbol: '€',   name: 'Euro',               code: 'EUR' },
  GBP: { symbol: '£',   name: 'British Pound',      code: 'GBP' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham',         code: 'AED' },
  SGD: { symbol: 'S$',  name: 'Singapore Dollar',   code: 'SGD' },
  AUD: { symbol: 'A$',  name: 'Australian Dollar',  code: 'AUD' },
  CAD: { symbol: 'C$',  name: 'Canadian Dollar',    code: 'CAD' },
}


export const CHORE_RECURRENCE = {
  daily:   'Daily',
  weekday: 'Weekdays',
  weekend: 'Weekends',
  weekly:  'Weekly',
  custom:  'Custom (n×/week)',
  once:    'One-time',
}

export const TRANSACTION_TYPES = {
  salary:       'Salary',
  bonus:        'Bonus',
  parent_bonus: 'Parent Bonus',
  loan_credit:  'Loan',
  loan_repay:    'Loan Repayment',
  loan_interest: 'Loan Interest',
  loan_cleared:  'Loan Cleared',
  tax:          'Tax',
  rent:         'Rent',
  utility:      'Utility',
  interest:     'Interest',
  reward:       'Reward',
  deposit:      'Deposit',
  withdrawal:   'Withdrawal',
}

export const REWARD_CATEGORIES = {
  screen_time: { label: 'Screen Time', emoji: '📱' },
  treat:       { label: 'Treat',       emoji: '🍭' },
  experience:  { label: 'Experience',  emoji: '🎉' },
  material:    { label: 'Material',    emoji: '🎁' },
  custom:      { label: 'Custom',      emoji: '⭐' },
}
