-- A stale catalogue form must not overwrite stock already changed by a sale.
drop function public.update_product_commercials(text,uuid,integer,numeric,integer);
create function public.update_product_commercials(
  p_sender text,p_product_id uuid,p_price integer,p_stock numeric,p_expected jsonb,p_cost integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare b uuid := public.require_whatsapp_business(p_sender); product public.products%rowtype;
begin
  select * into product from public.products where id=p_product_id and business_id=b for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if p_expected is distinct from jsonb_build_object('price_cents',product.sale_price_cents,
    'stock',product.stock,'cost_cents',product.unit_cost_cents) then raise exception 'PRODUCT_CHANGED'; end if;
  if p_price is null or p_price < 0 or p_stock is null or p_stock < 0
    or p_stock > 999999999.999 or round(p_stock,3) <> p_stock or p_cost < 0
    or (product.sale_unit='piece' and trunc(p_stock) <> p_stock) then raise exception 'INVALID_PRODUCT_VALUES'; end if;
  update public.products set sale_price_cents=p_price,stock=p_stock,unit_cost_cents=p_cost
    where id=p_product_id returning * into product;
  return to_jsonb(product) - 'creation_payload' - 'product_signature' - 'creation_key';
end;
$$;
revoke all on function public.update_product_commercials(text,uuid,integer,numeric,jsonb,integer) from public,anon,authenticated;
grant execute on function public.update_product_commercials(text,uuid,integer,numeric,jsonb,integer) to service_role;
