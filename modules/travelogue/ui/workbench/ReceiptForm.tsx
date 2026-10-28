"use client"

import { ChevronDown, Plus, X } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import { Collapsible } from "@/components/kumo/components/collapsible/collapsible"

// Form amounts remain strings while typing; conversion happens on confirmation.
export type ReceiptFormValues = {
  merchant: string
  date: string
  currency: string
  total: string
  items: { name: string; quantity: string; amount: string }[]
}

export default function ReceiptForm({
  value,
  onChange,
  disabled,
}: {
  value: ReceiptFormValues
  onChange: (value: ReceiptFormValues) => void
  disabled: boolean
}) {
  function updateItem(
    index: number,
    patch: Partial<ReceiptFormValues["items"][number]>
  ) {
    onChange({
      ...value,
      items: value.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    })
  }
  return (
    <div className="space-y-5">
      <Input
        label="店名"
        value={value.merchant}
        maxLength={300}
        disabled={disabled}
        onChange={(event) =>
          onChange({ ...value, merchant: event.target.value })
        }
      />
      <Input
        label="账单日期"
        type="date"
        value={value.date}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, date: event.target.value })}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
        <Input
          label="总额"
          inputMode="decimal"
          value={value.total}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, total: event.target.value })
          }
        />
        <Input
          label="币种"
          value={value.currency}
          maxLength={3}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, currency: event.target.value.toUpperCase() })
          }
        />
      </div>
      <Collapsible.Root>
        <Collapsible.Trigger
          render={
            <Button variant="ghost" className="w-full justify-between! px-0!" />
          }
        >
          消费明细
          <ChevronDown
            size={16}
            className="transition-transform [[data-panel-open]_&]:rotate-180"
          />
        </Collapsible.Trigger>
        <Collapsible.Panel className="space-y-4 pt-3">
          {value.items.map((item, index) => (
            <fieldset
              key={index}
              className="space-y-2 rounded-xl bg-journal-soft p-3"
            >
              <legend className="sr-only">消费项目 {index + 1}</legend>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`项目 ${index + 1} 名称`}
                  className="min-w-0 flex-1"
                  placeholder="消费项目"
                  value={item.name}
                  maxLength={500}
                  disabled={disabled}
                  onChange={(event) =>
                    updateItem(index, { name: event.target.value })
                  }
                />
                <Button
                  variant="ghost"
                  shape="square"
                  aria-label={`移除项目 ${index + 1}`}
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...value,
                      items: value.items.filter((_, i) => i !== index),
                    })
                  }
                >
                  <X size={15} />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  aria-label={`项目 ${index + 1} 数量`}
                  placeholder="数量"
                  inputMode="decimal"
                  value={item.quantity}
                  disabled={disabled}
                  onChange={(event) =>
                    updateItem(index, { quantity: event.target.value })
                  }
                />
                <Input
                  aria-label={`项目 ${index + 1} 金额`}
                  placeholder="金额"
                  inputMode="decimal"
                  value={item.amount}
                  disabled={disabled}
                  onChange={(event) =>
                    updateItem(index, { amount: event.target.value })
                  }
                />
              </div>
            </fieldset>
          ))}
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...value,
                items: [...value.items, { name: "", quantity: "", amount: "" }],
              })
            }
          >
            <Plus size={16} />
            添加项目
          </Button>
        </Collapsible.Panel>
      </Collapsible.Root>
    </div>
  )
}
