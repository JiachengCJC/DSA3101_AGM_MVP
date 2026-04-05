import React, { InputHTMLAttributes, useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export default function PasswordInput({
  className = '',
  disabled,
  id,
  ...props
}: PasswordInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative">
      <input
        {...props}
        id={inputId}
        disabled={disabled}
        type={showPassword ? 'text' : 'password'}
        className={`${className} pr-14`}
      />
      <button
        type="button"
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        aria-controls={inputId}
        disabled={disabled}
        onClick={() => setShowPassword((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-14 items-center justify-center rounded-r-2xl text-[#005372]/45 transition-colors hover:text-[#ED6B21] focus:outline-none focus:text-[#ED6B21] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  )
}
