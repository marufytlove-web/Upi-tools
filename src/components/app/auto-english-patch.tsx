"use client";

import { useEffect } from "react";

const replacements: Record<string, string> = {
  "全局管理": "API Control Panel",
  "用户管理": "Users",
  "全部订单": "Orders",
  "充值 CDK": "Recharge CDK",
  "接单账号": "Workers",
  "代理列表": "Proxies",
  "充值账单": "Billing",
  "UPI 提取管理": "UPI Extract Jobs",
  "用户数量": "Users",
  "可用余额": "Available Balance",
  "冻结余额": "Frozen Balance",
  "用户钱包": "User Wallets",
  "订单大厅": "Waiting Orders",
  "正在进行": "Active Orders",
  "需重传": "Needs Reupload",
  "历史订单": "Order History",
  "代理数量": "Proxy Count",
  "当前策略": "Current Strategy",
  "检测可用": "Alive Proxies",
  "检测失败": "Failed Proxies",
  "入口状态": "Channel Status",
  "正在提取": "Running Jobs",
  "等待中": "Queued Jobs",
  "成功 / 失败": "Success / Failed",
  "未兑换价值": "Unredeemed Value",
  "未结金额": "Unsettled Amount",
  "公益站设置": "Site Settings",
  "管理入口": "Admin Shortcuts",
  "保存": "Save",
  "刷新": "Refresh",
  "创建": "Create",
  "导出": "Export",
  "删除": "Delete",
  "确认": "Confirm",
  "取消": "Cancel",
  "搜索": "Search",
  "状态": "Status",
  "金额": "Amount",
  "时间": "Time",
  "邮箱": "Email",
  "失败": "Failed",
  "成功": "Success",
  "等待": "Waiting",
  "完成": "Completed",
  "下线": "Offline",
  "结单": "Settle",
  "停用": "Disable",
  "启用": "Enable",
  "检测": "Check",
  "公共": "Public",
  "管理后台": "Control Panel"
};

const keys = Object.keys(replacements).sort((a, b) => b.length - a.length);

function translate(value: string) {
  let next = value;
  for (const key of keys) {
    if (next.includes(key)) next = next.split(key).join(replacements[key]);
  }
  return next;
}

function patch(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const next = translate(node.nodeValue || "");
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  const attrs = ["placeholder", "title", "aria-label"];
  root.querySelectorAll?.("*").forEach((element) => {
    for (const attr of attrs) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const next = translate(value);
      if (next !== value) element.setAttribute(attr, next);
    }
  });
}

export function AutoEnglishPatch() {
  useEffect(() => {
    if (!window.location.pathname.startsWith("/admin")) return;
    patch(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) patch(node as Element);
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node as Text;
            const next = translate(text.nodeValue || "");
            if (next !== text.nodeValue) text.nodeValue = next;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}