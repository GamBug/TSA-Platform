import React from 'react'

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export function IconClock({ size = 15, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.5V8.2L10.6 9.8" />
    </svg>
  )
}

export function IconAlert({ size = 15, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M8 2.1L14.4 13.5H1.6L8 2.1Z" />
      <path d="M8 6.4V9.6" />
      <rect x="7.45" y="11.1" width="1.1" height="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconCheck({ size = 15, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M2.8 8.4L6.3 11.9L13.3 4.2" />
    </svg>
  )
}

export function IconCross({ size = 15, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M3.8 3.8L12.2 12.2" />
      <path d="M12.2 3.8L3.8 12.2" />
    </svg>
  )
}

export function IconLock({ size = 14, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="3.2" y="7.2" width="9.6" height="6.8" />
      <path d="M5.2 7.2V5C5.2 3.45 6.45 2.2 8 2.2C9.55 2.2 10.8 3.45 10.8 5V7.2" />
    </svg>
  )
}

export function IconExpand({ size = 15, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M9.8 2.2H13.8V6.2" />
      <path d="M13.6 2.4L9.2 6.8" />
      <path d="M6.2 13.8H2.2V9.8" />
      <path d="M2.4 13.6L6.8 9.2" />
    </svg>
  )
}

export function IconFlag({ size = 14, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M3.2 2V14.2" />
      <path d="M3.2 2.6H12.6L10.5 5.8L12.6 9H3.2" />
    </svg>
  )
}

export function IconArrowRight({ size = 14, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M2.5 8H13.2" />
      <path d="M9.2 4L13.4 8L9.2 12" />
    </svg>
  )
}

export function IconArrowLeft({ size = 14, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M13.5 8H2.8" />
      <path d="M6.8 4L2.6 8L6.8 12" />
    </svg>
  )
}

export function IconBook({ size = 15, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M2.5 3.2H7.2C7.65 3.2 8 3.55 8 4V13.2C8 12.75 7.5 12.4 7 12.4H2.5V3.2Z" />
      <path d="M13.5 3.2H8.8C8.35 3.2 8 3.55 8 4V13.2C8 12.75 8.5 12.4 9 12.4H13.5V3.2Z" />
    </svg>
  )
}

export function IconRefresh({ size = 15, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M13.2 7.5A5.2 5.2 0 1 1 11.7 4.3" />
      <path d="M13.2 2.4V5.4H10.2" />
    </svg>
  )
}

export function IconGrid({ size = 15, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="2.2" y="2.2" width="4.4" height="4.4" />
      <rect x="9.4" y="2.2" width="4.4" height="4.4" />
      <rect x="2.2" y="9.4" width="4.4" height="4.4" />
      <rect x="9.4" y="9.4" width="4.4" height="4.4" />
    </svg>
  )
}

export function IconLayers({ size = 15, className = '', ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M8 2.4L14 5.6L8 8.8L2 5.6L8 2.4Z" />
      <path d="M2 8.2L8 11.4L14 8.2" />
      <path d="M2 10.8L8 14L14 10.8" />
    </svg>
  )
}
