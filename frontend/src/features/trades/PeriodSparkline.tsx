import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { colorBySign } from "@/features/dashboard/palette";
import { preparePeriodPoints } from "@/features/dashboard/prepare";
import type { PeriodPoint } from "./periodTypes";

/**
 * Đường equity TRONG một kỳ: không trục, không nhãn, không tooltip.
 *
 * Nó trả lời "trong kỳ này tiền đi lên hay đi xuống, mượt hay gãy" — một câu
 * hỏi về HÌNH DẠNG. Thêm trục và nhãn vào một khung cao 48px chỉ làm chữ chen
 * nhau, và con số chính xác đã nằm ngay cạnh ở hàng KPI.
 *
 * KHÔNG rebase về 0 tại đầu kỳ: đây là một ĐOẠN của đường equity thật, nên
 * ngày thứ hai bắt đầu từ chỗ ngày thứ nhất dừng lại.
 */
export function PeriodSparkline({ points, netProfit }: { points: PeriodPoint[]; netProfit: string }) {
  // Một điểm không vẽ thành đường được. Recharts vẫn nhận, nhưng kết quả là
  // một khung trống trông y hệt lỗi tải — giữ chỗ bằng div để chiều cao của
  // thẻ không nhảy giữa các kỳ.
  if (points.length < 2) return <div className="h-16" aria-hidden />;

  // preparePeriodPoints chứ không phải một phép đổi tại chỗ: ranh giới
  // chuỗi→số nằm ở features/dashboard/prepare.ts và chỉ ở đó (spec 4a §2.3).
  // Nó cũng kiểm dạng rồi mới đổi, và ném thay vì trả NaN — một NaN lọt vào
  // Recharts cho ra đường KHÔNG VẼ RA, không kèm lỗi nào.
  const data = preparePeriodPoints(points);

  return (
    // aria-hidden: đường này là phần nhìn thêm, mọi con số nó gợi ý đều đã có
    // dạng chữ ở hàng KPI ngay bên cạnh. Đọc nó lên sẽ là đọc hai lần.
    // Cao CỐ ĐỊNH 64px, không giãn theo ô KPI bên cạnh. Cho nó cao bằng ô
    // KPI biến một gợi ý liếc mắt thành một biểu đồ đầy đủ — mà biểu đồ đầy đủ
    // thì đã có ở Dashboard, và ở đây nó át mất chính những con số mà thẻ tồn
    // tại để hiện. self-center để nó nằm giữa cột thay vì dính mép trên.
    <div className="h-16 w-full self-center" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          {/* domain theo dữ liệu thật: một kỳ đi từ 900 đến 1000 phải thấy được
              độ dốc, chứ không bị ép về gốc 0 rồi thành đường thẳng. */}
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="cum"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
            stroke={colorBySign(netProfit)}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
