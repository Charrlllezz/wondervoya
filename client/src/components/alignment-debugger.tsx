
import { useEffect, useState, useRef } from 'react';

interface AlignmentDebuggerProps {
  enabled?: boolean;
}

export const AlignmentDebugger = ({ enabled = true }: AlignmentDebuggerProps) => {
  const [alignmentData, setAlignmentData] = useState<any>(null);
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!enabled) return;

    const measureAlignment = () => {
      const chatContainer = document.querySelector('.chat-container');
      const activityPanel = document.querySelector('[ref="headerRef"]') || document.querySelector('.activity-panel-header');
      const firstMessage = document.querySelector('[id^="message-"]');
      const activitiesHeader = document.querySelector('h3:contains("Activities")') || 
                             document.querySelector('h3')?.closest('div')?.parentElement;

      if (chatContainer && activityPanel) {
        const chatRect = chatContainer.getBoundingClientRect();
        const activityRect = activityPanel.getBoundingClientRect();
        const firstMessageRect = firstMessage?.getBoundingClientRect();
        const scrollTop = window.pageYOffset;
        
        const alignment = {
          timestamp: Date.now(),
          scrollPosition: scrollTop,
          chat: {
            top: chatRect.top,
            left: chatRect.left,
            width: chatRect.width,
            height: chatRect.height
          },
          activity: {
            top: activityRect.top,
            left: activityRect.left,
            width: activityRect.width,
            height: activityRect.height
          },
          firstMessage: firstMessageRect ? {
            top: firstMessageRect.top,
            left: firstMessageRect.left,
            width: firstMessageRect.width,
            height: firstMessageRect.height
          } : null,
          horizontalOffset: activityRect.top - chatRect.top,
          isAligned: Math.abs(activityRect.top - chatRect.top) < 5,
          alignmentScore: Math.max(0, 100 - Math.abs(activityRect.top - chatRect.top)),
          recommendations: [] as string[]
        };

        // Add recommendations based on misalignment
        if (Math.abs(alignment.horizontalOffset) > 5) {
          if (alignment.horizontalOffset > 0) {
            alignment.recommendations.push('Activity panel is below chat - reduce marginTop');
          } else {
            alignment.recommendations.push('Activity panel is above chat - increase marginTop');
          }
        }

        if (Math.abs(alignment.horizontalOffset) > 20) {
          alignment.recommendations.push('Major misalignment detected - check scroll sync logic');
        }

        setAlignmentData(alignment);
        
        console.log('📏 Real-time Alignment Measurement:', alignment);
      }
    };

    // Measure immediately and then every 500ms
    measureAlignment();
    intervalRef.current = setInterval(measureAlignment, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled]);

  if (!enabled || !alignmentData) return null;

  return (
    <div 
      className="fixed top-4 left-4 bg-black/80 text-white p-4 rounded-lg text-xs font-mono z-[9999] max-w-sm"
      style={{ fontSize: '10px', lineHeight: '1.2' }}
    >
      <div className="font-bold mb-2">🔧 Alignment Debug</div>
      
      <div className={`mb-1 ${alignmentData.isAligned ? 'text-green-400' : 'text-red-400'}`}>
        Status: {alignmentData.isAligned ? '✅ ALIGNED' : '❌ MISALIGNED'}
      </div>
      
      <div className="mb-1">
        Offset: {alignmentData.horizontalOffset.toFixed(1)}px
      </div>
      
      <div className="mb-1">
        Score: {alignmentData.alignmentScore.toFixed(0)}/100
      </div>
      
      <div className="mb-1">
        Scroll: {alignmentData.scrollPosition}px
      </div>
      
      <div className="mb-2">
        Chat Top: {alignmentData.chat.top.toFixed(1)}px<br/>
        Activity Top: {alignmentData.activity.top.toFixed(1)}px
      </div>
      
      {alignmentData.recommendations.length > 0 && (
        <div className="border-t border-gray-600 pt-2">
          <div className="font-bold mb-1">Recommendations:</div>
          {alignmentData.recommendations.map((rec: string, i: number) => (
            <div key={i} className="text-yellow-400 text-xs">{rec}</div>
          ))}
        </div>
      )}
    </div>
  );
};
