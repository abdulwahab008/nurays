import type { Response } from 'express';
import { statementCsv, type PayoutStatement } from '../services/weekly-payout.service';

/** A payout statement as JSON, or as a CSV download when asked for `format=csv`. */
export function sendStatement(res: Response, statement: PayoutStatement, format: unknown) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="nuray-payout-${statement.payout.periodStart}-to-${statement.payout.periodEnd}.csv"`);
    res.status(200).send(statementCsv(statement));
    return;
  }
  res.status(200).json({ success: true, data: statement });
}
