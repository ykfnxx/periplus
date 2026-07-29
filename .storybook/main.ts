import type { StorybookConfig } from "@storybook/nextjs-vite"

const config: StorybookConfig = {
  stories: ["../modules/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
  viteFinal(viteConfig) {
    viteConfig.optimizeDeps = {
      ...viteConfig.optimizeDeps,
      include: [
        ...(viteConfig.optimizeDeps?.include ?? []),
        "@amap/amap-jsapi-loader",
        "react-markdown",
        "remark-gfm",
      ],
    }
    return viteConfig
  },
}

export default config
