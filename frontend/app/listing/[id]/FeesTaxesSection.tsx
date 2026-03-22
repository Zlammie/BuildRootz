"use client";

import { useState } from "react";
import styles from "./page.module.css";

export type FeesTaxesItem = {
  label: string;
  value: string;
};

export type FeesTaxesColumn = {
  key: string;
  top: FeesTaxesItem;
  bottom?: FeesTaxesItem | null;
};

type Props = {
  monthlyColumns: FeesTaxesColumn[];
  yearlyColumns: FeesTaxesColumn[];
};

type FeesTaxesMode = "monthly" | "yearly";

export default function FeesTaxesSection({
  monthlyColumns,
  yearlyColumns,
}: Props) {
  const [mode, setMode] = useState<FeesTaxesMode>("monthly");
  const columns = mode === "monthly" ? monthlyColumns : yearlyColumns;

  return (
    <div className={styles.feesSection}>
      <div className={styles.feesHeader}>
        <h3>Fees & taxes</h3>
        <div className={styles.feesToggle} role="group" aria-label="Fees and taxes view">
          <button
            type="button"
            className={`${styles.feesToggleBtn} ${
              mode === "monthly" ? styles.feesToggleBtnActive : ""
            }`}
            aria-pressed={mode === "monthly"}
            onClick={() => setMode("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`${styles.feesToggleBtn} ${
              mode === "yearly" ? styles.feesToggleBtnActive : ""
            }`}
            aria-pressed={mode === "yearly"}
            onClick={() => setMode("yearly")}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className={styles.feesColumns}>
        {columns.map((column) => (
          <div key={`${mode}-${column.key}`} className={styles.feesColumn}>
            <div className={styles.feesMetric}>
              <div className={styles.specLabel}>{column.top.label}</div>
              <div className={styles.specValue}>{column.top.value}</div>
            </div>
            {column.bottom ? (
              <div className={styles.feesMetric}>
                <div className={styles.specLabel}>{column.bottom.label}</div>
                <div className={styles.specValue}>{column.bottom.value}</div>
              </div>
            ) : (
              <div className={styles.feesMetricSpacer} aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
