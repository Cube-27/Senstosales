import { fmtMoney } from "@senstosales/schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { apiQuery } from "../../../lib/api.ts";
import { DeliveryChallan, Edit, Invoice, Link2 } from "../../../lib/icons.ts";
import { Badge, Button, PageHeader, QueryState } from "../../common/index.ts";
import { DeviationsSection } from "./DeviationsSection.tsx";
import { LinkedDocsPopover } from "./LinkedDocsPopover.tsx";
import { PODetailInfo } from "./PODetailInfo.tsx";
import { PODetailItems } from "./PODetailItems.tsx";

/** `/po/:id` (SPEC-16 §2): the PO header, its open flags, the header tabs and the items with their quantities. */
export function PODetail({ id }: { readonly id: string }) {
  const detail = useQuery(apiQuery("po.detail", { params: { id } }));

  if (!detail.data) return <QueryState error={detail.error} />;

  const data = detail.data;
  const { po, items, linked } = data;
  const links = linked.dcs.length + linked.invoices.length + linked.srvs.length;
  const itemNo = (itemId: string) => items.find((i) => i.id === itemId)?.poItemNo.toString();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={po.poNumber}
        backTo="/po"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {items.length} items <span className="opacity-40">•</span> Value:{" "}
              {po.poValue === null ? "—" : fmtMoney(po.poValue, { gemc: po.isGemc })}
            </span>
            {po.isGemc && (
              <Badge color="primary" size="sm">
                GEMC
              </Badge>
            )}
          </span>
        }
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LinkedDocsPopover
              poId={po.id}
              trigger={
                <Button variant="outline" size="sm">
                  <Link2 aria-hidden />
                  Chain ({links})
                </Button>
              }
            />
            <Button variant="outline" size="sm" asChild>
              <Link to="/po/create" search={{ id: po.id }}>
                <Edit aria-hidden />
                Edit
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/dc/create" search={{ po: po.id }}>
                <DeliveryChallan aria-hidden />
                Create Challan
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/invoice/create" search={{ po: po.id }}>
                <Invoice aria-hidden />
                Create Invoice
              </Link>
            </Button>
          </div>
        }
      />
      <DeviationsSection flags={data.flags} itemNo={itemNo} />
      <PODetailInfo po={po} />
      <PODetailItems detail={data} />
    </div>
  );
}
