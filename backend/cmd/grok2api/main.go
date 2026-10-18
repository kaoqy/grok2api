package main

// @title Grok2API
// @version 1.0
// @description Grok Build 账号池与兼容 API 网关。
// @BasePath /
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description 使用 "Bearer g2a_xxx_xxx"。

import (
	"fmt"
	"os"

	"github.com/chenyme/grok2api/backend/internal/cli"
)

func main() {
	if err := cli.Run(os.Args[1:]); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
