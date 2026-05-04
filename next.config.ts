type LocalWebpackConfig = {
  externals?: unknown[];
};

type LocalWebpackContext = {
  isServer: boolean;
};

const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["dockerode", "node-pty", "@prisma/client"],
  },
  webpack: (config: LocalWebpackConfig, { isServer }: LocalWebpackContext) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "node-pty"];
    }
    return config;
  },
};

export default nextConfig;
