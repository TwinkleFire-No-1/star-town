/**
 * T5.2.2 记忆检索准确性调优 — 质量评估工具
 * 
 * 评估检索质量指标：
 * 1. 相关性：检索结果与查询的语义相关度
 * 2. 时效性：检索结果中近期记忆的占比
 * 3. 类型分布：对话/观察/反思/关系记忆的分布
 * 4. 分数分布：得分的标准差（区分度）
 */

export interface RetrievalQualityReport {
  /** 查询文本 */
  query: string
  /** 返回记忆数 */
  resultCount: number
  /** 平均得分 */
  avgScore: number
  /** 得分标准差（区分度，越高越好） */
  scoreStdDev: number
  /** 平均相关性 */
  avgRelevance: number
  /** 平均时效性 */
  avgRecency: number
  /** 近期记忆占比（1天内） */
  recentRatio: number
  /** 类型分布 */
  typeDistribution: Record<string, number>
  /** 质量评级 */
  grade: 'A' | 'B' | 'C' | 'D'
  /** 评估说明 */
  notes: string[]
}

export function evaluateRetrievalQuality(
  query: string,
  memories: Array<{
    score: number
    scoreBreakdown?: { relevance: number; importance: number; recency: number }
    type: string
    createdAt: Date
    content: string
  }>,
): RetrievalQualityReport {
  const notes: string[] = []
  const resultCount = memories.length

  if (resultCount === 0) {
    return {
      query,
      resultCount: 0,
      avgScore: 0,
      scoreStdDev: 0,
      avgRelevance: 0,
      avgRecency: 0,
      recentRatio: 0,
      typeDistribution: {},
      grade: 'D',
      notes: ['无检索结果，检索质量不合格'],
    }
  }

  // 计算平均得分
  const avgScore = memories.reduce((sum, m) => sum + m.score, 0) / resultCount

  // 计算标准差
  const variance = memories.reduce((sum, m) => sum + Math.pow(m.score - avgScore, 2), 0) / resultCount
  const scoreStdDev = Math.sqrt(variance)

  // 平均相关性和时效性
  const avgRelevance = memories.reduce((sum, m) => sum + (m.scoreBreakdown?.relevance ?? 0), 0) / resultCount
  const avgRecency = memories.reduce((sum, m) => sum + (m.scoreBreakdown?.recency ?? 0), 0) / resultCount

  // 近期记忆占比（1天内）
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
  const recentCount = memories.filter((m) => m.createdAt.getTime() > oneDayAgo).length
  const recentRatio = recentCount / resultCount

  // 类型分布
  const typeDistribution: Record<string, number> = {}
  for (const m of memories) {
    typeDistribution[m.type] = (typeDistribution[m.type] ?? 0) + 1
  }

  // 质量评级
  let grade: 'A' | 'B' | 'C' | 'D' = 'D'

  if (avgScore >= 0.5 && scoreStdDev >= 0.1 && avgRelevance >= 0.4) {
    grade = 'A'
    notes.push('检索质量优秀：得分高、区分度好、相关性强')
  } else if (avgScore >= 0.35 && scoreStdDev >= 0.05) {
    grade = 'B'
    notes.push('检索质量良好：得分和区分度达到标准')
  } else if (avgScore >= 0.2) {
    grade = 'C'
    notes.push('检索质量一般：得分偏低，可能存在噪音')
  } else {
    grade = 'D'
    notes.push('检索质量不合格：得分过低，需检查检索策略')
  }

  // 额外检查
  if (recentRatio < 0.3 && avgRecency < 0.3) {
    notes.push('警告：近期记忆占比过低，时效性可能不足')
  }

  if (scoreStdDev < 0.05) {
    notes.push('警告：得分区分度过低，记忆间缺乏区分度')
  }

  return {
    query,
    resultCount,
    avgScore: Math.round(avgScore * 1000) / 1000,
    scoreStdDev: Math.round(scoreStdDev * 1000) / 1000,
    avgRelevance: Math.round(avgRelevance * 1000) / 1000,
    avgRecency: Math.round(avgRecency * 1000) / 1000,
    recentRatio: Math.round(recentRatio * 100) / 100,
    typeDistribution,
    grade,
    notes,
  }
}
