import {Await, useMatches, Link} from '@remix-run/react';
import {Suspense} from 'react';
import {CartForm, CartQueryData, flattenConnection} from '@shopify/hydrogen';
import {type ActionArgs, json} from '@shopify/remix-oxygen';
import type {CartApiQueryFragment} from 'storefrontapi.generated';

export async function action({request, context}: ActionArgs) {
  const {session, cart} = context;

  const [formData, customerAccessToken] = await Promise.all([
    request.formData(),
    session.get('customerAccessToken'),
  ]);

  const {action, inputs} = CartForm.getFormInput(formData);

  if (!action) {
    throw new Error('No action provided');
  }

  let status = 200;
  let result: CartQueryData;

  switch (action) {
    case CartForm.ACTIONS.LinesAdd:
      result = await cart.addLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesUpdate:
      result = await cart.updateLines(inputs.lines);
      break;
    case CartForm.ACTIONS.LinesRemove:
      result = await cart.removeLines(inputs.lineIds);
      break;
    case CartForm.ACTIONS.DiscountCodesUpdate: {
      const formDiscountCode = inputs.discountCode;

      // User inputted discount code
      const discountCodes = (
        formDiscountCode ? [formDiscountCode] : ['']
      ) as string[];

      // Combine discount codes already applied on cart
      discountCodes.push(...inputs.discountCodes);

      result = await cart.updateDiscountCodes(discountCodes);
      break;
    }
    case CartForm.ACTIONS.BuyerIdentityUpdate: {
      result = await cart.updateBuyerIdentity({
        ...inputs.buyerIdentity,
        customerAccessToken,
      });
      break;
    }
    default:
      throw new Error(`${action} cart action is not defined`);
  }

  /**
   * The Cart ID may change after each mutation. We need to update it each time in the session.
   */
  const cartId = result.cart.id;
  const headers = cart.setCartId(result.cart.id);

  const redirectTo = formData.get('redirectTo') ?? null;
  if (typeof redirectTo === 'string') {
    status = 303;
    headers.set('Location', redirectTo);
  }

  const {cart: cartResult, errors} = result;
  return json(
    {
      cart: cartResult,
      errors,
      analytics: {
        cartId,
      },
    },
    {status, headers},
  );
}

export default function Cart() {
  const [root] = useMatches();
  const cartPromise = root.data?.cart as
    | Promise<CartApiQueryFragment>
    | Promise<null>;

  return (
    <section className="cart">
      <h1>Cart</h1>
      <Suspense fallback="loading">
        <Await
          errorElement={<div>An error occurred</div>}
          resolve={cartPromise}
        >
          {(cart) => {
            if (!cart || !cart.lines?.nodes?.length) {
              return <CartEmpty />;
            }
            return <CartLines lines={cart.lines} />;
          }}
        </Await>
      </Suspense>
    </section>
  );
}

function CartEmpty() {
  return (
    <div>
      <p>Looks like you haven&rsquo;t added anything to your cart.</p>
      <div>
        <br />
        <Link prefetch="intent" to="/collections">
          Browse our collections <symbol>→</symbol>
        </Link>
      </div>
    </div>
  );
}

function CartLines({lines}: Pick<CartFragment, 'lines'>) {
  const cartLines = lines ? flattenConnection(lines) : [];
  return (
    <ul>
      {cartLines.map((line) => (
        <div key={line.id}>
          <h2>{line.merchandise.title}</h2>
        </div>
      ))}
    </ul>
  );
}
