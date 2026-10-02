/** Semantic tokens shared conceptually with the web brand. */
export const designTokens = {
  colors: {
    background: '#f5f5f2',
    surface: '#ffffff',
    text: '#202b37',
    muted: '#586574',
    border: '#dce2e6',
    primary: '#245b83',
    onPrimary: '#ffffff',
    brand: '#ffdd55',
    success: '#157f3d',
    warning: '#946200',
    error: '#b42318',
    help: '#eef4ff',
  },
  space: { xs: 8, sm: 16, md: 24, lg: 32 },
  radius: { control: 10, surface: 12 },
  typography: { body: 16, label: 14, title: 28 },
  touchTarget: 44,
} as const;
