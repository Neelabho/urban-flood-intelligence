import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, ScatterChart, HeatmapChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, MarkAreaComponent,
  VisualMapComponent, TitleComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, LineChart, ScatterChart, HeatmapChart, GridComponent, TooltipComponent, LegendComponent,
  DataZoomComponent, MarkLineComponent, MarkAreaComponent, VisualMapComponent, TitleComponent, CanvasRenderer])

export const CHART_FONT = { fontFamily: 'Inter, system-ui, sans-serif', color: '#3d4b5c', fontSize: 11 }
export const AXIS = {
  axisLine: { lineStyle: { color: '#dcd7cb' } },
  axisTick: { lineStyle: { color: '#dcd7cb' } },
  splitLine: { lineStyle: { color: '#efece4' } },
  axisLabel: { color: '#6b7280', fontSize: 10.5 },
  nameTextStyle: { color: '#6b7280', fontSize: 10.5 },
}
export const PALETTE = ['#0f1b2d', '#d9762b', '#3d6a8e', '#a8322d', '#d9a441', '#4f7a5a', '#8c8579', '#6d4c7d']

export default function EChart({ option, height = 280, className = '' }: { option: echarts.EChartsCoreOption; height?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)
  useEffect(() => {
    if (!ref.current) return
    inst.current = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    const ro = new ResizeObserver(() => inst.current?.resize())
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      inst.current?.dispose()
    }
  }, [])
  useEffect(() => {
    inst.current?.setOption({ textStyle: CHART_FONT, color: PALETTE, animationDuration: 300, ...option }, true)
  }, [option])
  return <div ref={ref} className={className} style={{ height, width: '100%' }} />
}
