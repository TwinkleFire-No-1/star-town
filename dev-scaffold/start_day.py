#!/usr/bin/env python3
"""
星火小镇 — Agent每日启动脚本
用途：Agent每天开发开始时运行此脚本，自动读取当前进度并输出今日待办
"""

import os
import re
import sys
from datetime import datetime

SCAFFOLD_DIR = os.path.dirname(os.path.abspath(__file__))

def read_file(path):
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    return ""

def get_current_day():
    """从PROGRESS.md中读取当前Day"""
    progress = read_file(os.path.join(SCAFFOLD_DIR, "PROGRESS.md"))
    match = re.search(r'当前Day\| Day (\d+)', progress)
    if match:
        return int(match.group(1))
    # 默认Day 1
    return 1

def get_current_sprint(day):
    if day <= 5: return 1
    elif day <= 10: return 2
    elif day <= 15: return 3
    else: return 4

def count_task_status(content, status_char):
    """统计某状态标记的数量"""
    return content.count(status_char)

def analyze_backlog():
    """分析backlog进度"""
    tasks = read_file(os.path.join(SCAFFOLD_DIR, "backlog", "tasks.md"))
    done = tasks.count("✅")
    in_progress = tasks.count("⏳")
    blocked = tasks.count("❌")
    todo = tasks.count("⬜")
    total = done + in_progress + blocked + todo
    return total, done, in_progress, blocked, todo

def print_daily_brief(day):
    """输出今日开发简报"""
    sprint = get_current_sprint(day)
    day_file = os.path.join(SCAFFOLD_DIR, "daily", f"day-{day:02d}.md")
    sprint_file = os.path.join(SCAFFOLD_DIR, "sprints", f"sprint-{sprint}.md")
    
    total, done, in_prog, blocked, todo = analyze_backlog()
    
    print("=" * 60)
    print(f"  星火小镇 — Day {day:02d} 开发简报")
    print(f"  Sprint {sprint} | {datetime.now().strftime('%Y-%m-%d')}")
    print("=" * 60)
    print()
    print(f"📊 全局进度")
    print(f"   总Task: {total} | 完成: {done} | 进行中: {in_prog} | 阻塞: {blocked} | 待开始: {todo}")
    if total > 0:
        print(f"   完成率: {done/total*100:.1f}%")
    print()
    
    if os.path.exists(day_file):
        content = read_file(day_file)
        # Extract today's tasks
        tasks_section = re.search(r'## 今日任务\n\|.*?\n\|.*?\n\n(.*?)(?=\n## )', content, re.DOTALL)
        if tasks_section:
            task_text = tasks_section.group(1).strip()
            task_lines = [l for l in task_text.split('\n') if l.strip() and l.strip() != '']
            print(f"📋 今日任务 ({len(task_lines)} 项)")
            for line in task_lines:
                print(f"   {line}")
        else:
            print("📋 今日任务（详见 daily/day-{:02d}.md）".format(day))
    else:
        print(f"⚠️  未找到 day-{day:02d}.md，请确认脚手架是否完整")
    
    print()
    print(f"📖 参考文件")
    print(f"   每日计划: dev-scaffold/daily/day-{day:02d}.md")
    print(f"   Sprint计划: dev-scaffold/sprints/sprint-{sprint}.md")
    print(f"   Task清单: dev-scaffold/backlog/tasks.md")
    print(f"   进度总览: dev-scaffold/PROGRESS.md")
    print(f"   风险追踪: dev-scaffold/docs/risks.md")
    print()
    print("=" * 60)
    print(f"🚀 开始开发吧！完成后请更新 daily/day-{day:02d}.md")
    print(f"   并写入明日计划到 daily/day-{day+1:02d}.md")
    print("=" * 60)

if __name__ == "__main__":
    day = int(sys.argv[1]) if len(sys.argv) > 1 else get_current_day()
    print_daily_brief(day)
