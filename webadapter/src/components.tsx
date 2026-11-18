import type { ReactNode } from 'react'
import { TextField } from '@heroui/react/textfield'
import { Input } from '@heroui/react/input'
import { TextArea } from '@heroui/react/textarea'
import { Label } from '@heroui/react/label'
import { Description } from '@heroui/react/description'
import { Card } from '@heroui/react/card'
import { Icon, type IconifyIcon } from '@iconify/react'

export const Field = ({
  label,
  description,
  value,
  onChange,
  type = 'text',
  multiline = false,
  required = false,
  disabled = false
}: {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'password' | 'number' | 'url'
  multiline?: boolean
  required?: boolean
  disabled?: boolean
}) => (
  <TextField
    name={label}
    value={value}
    onChange={onChange}
    isRequired={required}
    isDisabled={disabled}
    className={multiline ? 'wide' : ''}
  >
    <Label>{label}</Label>
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
