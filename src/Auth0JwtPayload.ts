import { JwtPayload } from '@cfworker/jwt';

export interface Auth0JwtPayload extends JwtPayload {
    azp: string;
    scope: string;
    permissions: string[];
}
