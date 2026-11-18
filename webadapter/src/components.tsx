import type { ReactNode } from 'react'
import { TextField } from '@heroui/react/textfield'
import { Input } from '@heroui/react/input'
import { TextArea } from '@heroui/react/textarea'
import { Label } from '@heroui/react/label'
import { Description } from '@heroui/react/description'
import { FieldError } from '@heroui/react/field-error'
import { Card } from '@heroui/react/card'
import { ComboBox } from '@heroui/react/combo-box'
import { ListBox } from '@heroui/react/list-box'
import { Icon, type IconifyIcon } from '@iconify/react'
import type { AccountOption } from '../../src/types'

export const AccountField = ({
  label,
  value,
  onChange,
  options,
  description,
  placeholder
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: AccountOption[]
  description: string
  placeholder: string
}) => (
  <ComboBox
    allowsCustomValue
    menuTrigger="manual"
    inputValue={value}
    onInputChange={onChange}
    selectedKey={options.some((option) => option.id === value) ? value : null}
    onSelectionChange={(key) => {
      if (key !== null) onChange(String(key))
    }}
  >
    <Label>{label}</Label>
    <ComboBox.InputGroup>
      <Input placeholder={placeholder} inputMode="numeric" autoComplete="off" />
      <ComboBox.Trigger />
    </ComboBox.InputGroup>
    <ComboBox.Popover>
      <ListBox renderEmptyState={() => '暂无可选账号或好友，可直接填写 QQ 号'}>
        {options.map(({ id, name }) => (
          <ListBox.Item key={id} id={id} textValue={id}>
            {name === id ? id : `${name}（${id}）`}
            <ListBox.ItemIndicator />
          </ListBox.Item>
        ))}
      </ListBox>
    </ComboBox.Popover>
    <Description>{description}</Description>
  </ComboBox>
)

export const Field = ({
  label,
  description,
  value,
  onChange,
  type = 'text',
  multiline = false,
  required = false,
  disabled = false,
  error
}: {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'password' | 'number' | 'url'
  multiline?: boolean
  required?: boolean
  disabled?: boolean
  error?: string
}) => (
  <TextField
    name={label}
    value={value}
    onChange={onChange}
    isRequired={required}
    isDisabled={disabled}
    isInvalid={Boolean(error)}
    className={multiline ? 'wide' : ''}
  >
    <Label>
      {label}
      {required && (
        <span className="required-label" aria-hidden>
          必填
        </span>
      )}
    </Label>
    {multiline ? (
      <TextArea rows={6} spellCheck={false} autoComplete="off" />
    ) : (
      <Input
        type={type}
        spellCheck={false}
        autoComplete="off"
        inputMode={type === 'number' ? 'numeric' : undefined}
      />
    )}
    {description && <Description>{description}</Description>}
    {error && <FieldError>{error}</FieldError>}
  </TextField>
)

export const Section = ({
  title,
  description,
  icon,
  children
}: {
  title: string
  description: string
  icon: IconifyIcon
  children: ReactNode
}) => (
  <Card className="section-card">
    <Card.Header>
      <Icon icon={icon} aria-hidden className="section-icon" />
      <div>
        <h2 className="card__title">{title}</h2>
        <Card.Description>{description}</Card.Description>
      </div>
    </Card.Header>
    <Card.Content className="fields">{children}</Card.Content>
  </Card>
)
